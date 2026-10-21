import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { COLLECTIONS, createStore } from '../services/storageService';
import { useSettings } from './SettingsContext';
import { cleanOwner, fetchUtilityBill, SYNC_INTERVAL_MS } from '../services/billAggregatorApi';
import {
  billAmountPKR,
  billCycle,
  contactBalances,
  debtTotals,
  ledgerEffects,
  projection,
  transactionEffects,
  upcomingItems,
} from '../utils/analytics';
import { BILLING_CYCLES, CONTACT_CATEGORIES, LEDGER_KINDS, UTILITY_PROVIDERS } from '../utils/constants';
import { addMonths, formatMoney, todayISO } from '../utils/formatters';

const FinanceContext = createContext(null);

const EMPTY = { accounts: [], transactions: [], bills: [], committees: [], contacts: [], ledger: [] };

const byCreated = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
const byDueDate = (a, b) => a.dueDate.localeCompare(b.dueDate);
const byName = (a, b) => a.name.localeCompare(b.name);

const balanceOp = (accountId, delta) => ({
  type: 'update',
  collection: 'accounts',
  id: accountId,
  increment: { balance: delta },
});

/**
 * One balance op per account from a list of effects ([{ accountId, delta }]), each multiplied by `factor`
 * (-1 reverses). Effects on the same account are merged; accounts in `skip` (e.g. deleted) are left out.
 */
function balanceOps(effects, { factor = 1, skip } = {}) {
  const totals = {};
  for (const { accountId, delta } of effects) {
    if (accountId && !skip?.has(accountId)) totals[accountId] = (totals[accountId] ?? 0) + factor * delta;
  }
  return Object.entries(totals)
    .filter(([, delta]) => delta !== 0)
    .map(([accountId, delta]) => balanceOp(accountId, delta));
}

/** Bill fields refreshed from an aggregator / demo lookup result. */
const fetchedBillFields = (result) => ({
  amount: result.amount,
  dueDate: result.dueDate,
  estimated: false,
  billerStatus: result.status,
  billingMonth: result.billingMonth,
  company: result.company,
  // Only overwrite saved owner details when the service actually returned some.
  ...(result.owner && { owner: result.owner, ownerSource: 'live' }),
  lateAmount: result.lateAmount,
  // Extra detail only the live (PITC) service returns.
  ...(result.source === 'live' && {
    units: result.units,
    issueDate: result.issueDate,
    paidAmount: result.paidAmount,
    paidOn: result.paidOn,
    history: result.history,
  }),
  source: result.source,
  lastSyncedAt: Date.now(),
  syncError: null,
});

export function FinanceProvider({ children }) {
  const { user } = useAuth();
  const { rates } = useSettings();
  const uid = user?.uid;
  const isLocal = user?.isLocal;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const store = useMemo(() => (user ? createStore(user) : null), [uid, isLocal]);
  const [data, setData] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setData(EMPTY);
    setReady(false);
    if (!store) return undefined;

    const loaded = new Set();
    const unsubscribers = COLLECTIONS.map((name) =>
      store.subscribe(name, (docs) => {
        setData((prev) => ({ ...prev, [name]: docs }));
        loaded.add(name);
        if (loaded.size === COLLECTIONS.length) setReady(true);
      }),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [store]);

  const accounts = useMemo(() => [...data.accounts].sort(byCreated), [data.accounts]);
  const transactions = useMemo(() => [...data.transactions].sort(byDateDesc), [data.transactions]);
  const bills = useMemo(() => [...data.bills].sort(byDueDate), [data.bills]);
  const committees = useMemo(() => [...data.committees].sort(byCreated), [data.committees]);
  const contacts = useMemo(() => [...data.contacts].sort(byName), [data.contacts]);
  const ledger = useMemo(() => [...data.ledger].sort(byDateDesc), [data.ledger]);

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const contactsById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const upcoming = useMemo(() => upcomingItems(bills, committees, rates), [bills, committees, rates]);

  // Realized balance: liquid money in cash, bank and wallet accounts. Balances only ever move for cleared
  // entries, so this is opening balances + cleared income − cleared expenses (± transfers and loan cash).
  // Net worth: accumulated savings plus net settled capital from loans (receivables − debts) — deliberately
  // not the day-to-day operational balance.
  const totals = useMemo(() => {
    const sumOf = (list) => list.reduce((sum, a) => sum + (a.balance ?? 0), 0);
    const realizedBalance = sumOf(accounts.filter((a) => a.type !== 'savings'));
    const savings = sumOf(accounts.filter((a) => a.type === 'savings'));
    const balances = contactBalances(ledger);
    const { receivable, payable } = debtTotals(balances);
    return {
      realizedBalance,
      savings,
      receivable,
      payable,
      contactBalances: balances,
      netWorth: savings + receivable - payable,
      projected: projection(transactions, upcoming),
    };
  }, [accounts, ledger, transactions, upcoming]);

  /** Commits ops atomically and reports the outcome as a toast. Resolves to true on success. */
  const run = useCallback(
    async (ops, successMessage) => {
      try {
        await store.commit(ops);
        if (successMessage) setToast({ type: 'success', message: successMessage, id: Date.now() });
        return true;
      } catch (error) {
        console.error('[WalletZen]', error);
        setToast({ type: 'error', message: error.message || 'Something went wrong', id: Date.now() });
        return false;
      }
    },
    [store],
  );

  const requireAccount = useCallback(
    (accountId) => {
      if (!accountsById[accountId]) throw new Error('Link this item to an existing account first.');
    },
    [accountsById],
  );

  const guarded = useCallback(
    (build, message) => {
      try {
        return run(build(), message);
      } catch (error) {
        setToast({ type: 'error', message: error.message, id: Date.now() });
        return Promise.resolve(false);
      }
    },
    [run],
  );

  // ---------- Accounts ----------

  const saveAccount = useCallback(
    ({ id, name, type, provider, balance }) => {
      const amount = Number(balance) || 0;
      if (!id) {
        const data = {
          name: name.trim(),
          type,
          provider: provider ?? null,
          balance: amount,
          openingBalance: amount,
          openedOn: todayISO(),
          createdAt: Date.now(),
        };
        return run([{ type: 'set', collection: 'accounts', id: store.newId(), data }], 'Account added');
      }
      // A manual balance correction is folded into the opening balance so the trend chart stays consistent.
      const delta = amount - (accountsById[id]?.balance ?? 0);
      return run(
        [
          {
            type: 'update',
            collection: 'accounts',
            id,
            data: { name: name.trim(), type, provider: provider ?? null },
            increment: { balance: delta, openingBalance: delta },
          },
        ],
        'Account updated',
      );
    },
    [run, store, accountsById],
  );

  const deleteAccount = useCallback(
    (id) => {
      // Transfers touching the account go with it; the other side keeps its balance, like any money moved out.
      const linked = (t) => t.accountId === id || t.toAccountId === id;
      const ops = [
        { type: 'delete', collection: 'accounts', id },
        ...transactions.filter(linked).map((t) => ({ type: 'delete', collection: 'transactions', id: t.id })),
        ...bills.filter((b) => b.accountId === id).map((b) => ({ type: 'update', collection: 'bills', id: b.id, data: { accountId: null } })),
        ...committees
          .filter((c) => c.accountId === id)
          .map((c) => ({ type: 'update', collection: 'committees', id: c.id, data: { accountId: null } })),
        // Loans stay in the contact's ledger, just no longer tied to an account.
        ...ledger.filter((e) => e.accountId === id).map((e) => ({ type: 'update', collection: 'ledger', id: e.id, data: { accountId: null } })),
      ];
      return run(ops, 'Account deleted');
    },
    [run, transactions, bills, committees, ledger],
  );

  // ---------- Transactions ----------

  /** Balance ops that undo `previous` (if any) and apply `next` (if any), skipping deleted accounts. */
  const rebalance = useCallback(
    (previous, next) => {
      const deleted = new Set(
        [previous, next].flatMap((tx) => (tx ? [tx.accountId, tx.toAccountId] : [])).filter((id) => id && !accountsById[id]),
      );
      const effects = [
        ...(previous ? transactionEffects(previous).map((e) => ({ ...e, delta: -e.delta })) : []),
        ...(next ? transactionEffects(next) : []),
      ];
      return balanceOps(effects, { skip: deleted });
    },
    [accountsById],
  );

  /**
   * Income or expense. Future-dated entries are always saved as pending (projected) and never touch the balance;
   * today's or past entries can be pending too ("not received yet") until clearTransaction marks them cleared.
   */
  const saveTransaction = useCallback(
    ({ id, type, amount, category, accountId, note, date, status, contactId }) =>
      guarded(() => {
        requireAccount(accountId);
        const pending = status === 'pending' || date > todayISO();
        const next = {
          type,
          amount: Number(amount),
          category,
          accountId,
          note: note?.trim() ?? '',
          date,
          status: pending ? 'pending' : 'cleared',
          contactId: contactId || null,
        };
        const previous = id ? transactions.find((t) => t.id === id) : null;
        const txId = id ?? store.newId();
        return [
          id
            ? { type: 'update', collection: 'transactions', id, data: next }
            : { type: 'set', collection: 'transactions', id: txId, data: { ...next, createdAt: Date.now() } },
          ...rebalance(previous, next),
        ];
      }, id ? 'Transaction updated' : `${type === 'income' ? 'Income' : 'Expense'} ${status === 'pending' || date > todayISO() ? 'scheduled' : 'recorded'}`),
    [guarded, requireAccount, store, transactions, rebalance],
  );

  /** Marks a pending entry as received/paid: it now counts in the balance. An early clear is dated today. */
  const clearTransaction = useCallback(
    (tx) =>
      guarded(() => {
        requireAccount(tx.accountId);
        const today = todayISO();
        const next = { ...tx, status: 'cleared', date: tx.date > today ? today : tx.date };
        return [
          { type: 'update', collection: 'transactions', id: tx.id, data: { status: 'cleared', date: next.date } },
          ...rebalance(tx, next),
        ];
      }, tx.type === 'income' ? 'Marked as received' : 'Marked as paid'),
    [guarded, requireAccount, rebalance],
  );

  /** Moves money between your own accounts (e.g. allocating cash to a savings vault). Not income or expense. */
  const saveTransfer = useCallback(
    ({ id, fromAccountId, toAccountId, amount, date, note }) =>
      guarded(() => {
        requireAccount(fromAccountId);
        requireAccount(toAccountId);
        if (fromAccountId === toAccountId) throw new Error('Choose two different accounts.');
        if (date > todayISO()) throw new Error('Transfers move money now — pick today or an earlier date.');
        const next = {
          type: 'transfer',
          amount: Number(amount),
          category: 'transfer',
          accountId: fromAccountId,
          toAccountId,
          note: note?.trim() ?? '',
          date,
          status: 'cleared',
        };
        const previous = id ? transactions.find((t) => t.id === id) : null;
        return [
          id
            ? { type: 'update', collection: 'transactions', id, data: next }
            : { type: 'set', collection: 'transactions', id: store.newId(), data: { ...next, createdAt: Date.now() } },
          ...rebalance(previous, next),
        ];
      }, accountsById[toAccountId]?.type === 'savings' ? 'Moved to savings' : 'Transfer saved'),
    [guarded, requireAccount, store, transactions, rebalance, accountsById],
  );

  const deleteTransaction = useCallback(
    (tx) => {
      const ops = [{ type: 'delete', collection: 'transactions', id: tx.id }, ...rebalance(tx, null)];

      // Undo whatever planner state this transaction settled.
      const bill = tx.billId && bills.find((b) => b.id === tx.billId);
      if (bill?.transactionId === tx.id) {
        ops.push({ type: 'update', collection: 'bills', id: bill.id, data: { status: 'pending', paidOn: null, transactionId: null, nextBillId: null } });
        const nextBill = bill.nextBillId && bills.find((b) => b.id === bill.nextBillId);
        if (nextBill?.status === 'pending') ops.push({ type: 'delete', collection: 'bills', id: nextBill.id });
      }
      const committee = tx.committeeId && committees.find((c) => c.id === tx.committeeId);
      if (committee && tx.committeeEvent === 'installment' && committee.paidCount > 0) {
        ops.push({ type: 'update', collection: 'committees', id: committee.id, increment: { paidCount: -1 } });
      }
      if (committee && tx.committeeEvent === 'payout') {
        ops.push({ type: 'update', collection: 'committees', id: committee.id, data: { received: false } });
      }
      return run(ops, 'Transaction deleted');
    },
    [run, rebalance, bills, committees],
  );

  // ---------- Bills, utilities & subscriptions ----------

  const saveBill = useCallback(
    (form) => {
      const amount = form.amount === '' || form.amount == null ? null : Number(form.amount);
      const data = {
        kind: form.kind,
        title: form.title.trim(),
        amount,
        currency: form.currency ?? 'PKR',
        cycle: form.cycle,
        category: form.category,
        dueDate: form.dueDate,
        accountId: form.accountId || null,
        brandDomain: form.brandDomain?.trim() || null,
        icon: form.icon ?? null,
        provider: form.provider ?? null,
        idType: form.idType ?? null,
        consumerId: form.consumerId?.trim() || null,
        ...(amount != null && { estimated: false }),
        // 'manual' marks an amount typed in by the user (e.g. replacing a demo bill with the real figure).
        ...(form.source !== undefined && { source: form.source }),
        ...(form.owner !== undefined && { owner: cleanOwner(form.owner), ownerSource: form.ownerSource ?? 'manual' }),
      };
      const noun = form.kind === 'subscription' ? 'Subscription' : 'Bill';
      if (form.id) return run([{ type: 'update', collection: 'bills', id: form.id, data }], `${noun} updated`);
      return run(
        [{ type: 'set', collection: 'bills', id: store.newId(), data: { ...data, status: 'pending', createdAt: Date.now() } }],
        `${noun} added`,
      );
    },
    [run, store],
  );

  const deleteBill = useCallback((id) => run([{ type: 'delete', collection: 'bills', id }], 'Removed from planner'), [run]);

  /**
   * "Pay & Sync Balance": logs the expense (USD/EUR converted at the user's rate), debits the linked
   * wallet and, for recurring items, schedules the next cycle — all in one atomic batch.
   */
  const markBillPaid = useCallback(
    (bill) =>
      guarded(() => {
        requireAccount(bill.accountId);
        const amountPKR = billAmountPKR(bill, rates);
        if (!(amountPKR > 0)) throw new Error(`Enter the amount for ${bill.title} first.`);
        // Never deduct a made-up figure from a real wallet.
        if (bill.source === 'demo') throw new Error(`${bill.title} has sample (demo) figures — enter the exact amount from your bill first.`);

        const txId = store.newId();
        const today = todayISO();
        const foreign = bill.currency && bill.currency !== 'PKR';
        const note = foreign ? `${bill.title} (${formatMoney(bill.amount, bill.currency)} @ ${rates[bill.currency]})` : bill.title;
        const ops = [
          {
            type: 'set',
            collection: 'transactions',
            id: txId,
            data: {
              type: 'expense',
              amount: amountPKR,
              category: bill.category,
              accountId: bill.accountId,
              note,
              date: today,
              billId: bill.id,
              createdAt: Date.now(),
            },
          },
          balanceOp(bill.accountId, -amountPKR),
        ];

        let nextBillId = null;
        const cycle = billCycle(bill);
        const months = BILLING_CYCLES[cycle]?.months ?? 0;
        if (months > 0) {
          nextBillId = store.newId();
          // Carry the definition forward; drop per-cycle state.
          // eslint-disable-next-line no-unused-vars
          const { id, status, paidOn, transactionId, nextBillId: _next, createdAt, recurrence, lastSyncedAt, syncError, billerStatus, billingMonth, consumerName, lateAmount, ...template } = bill;
          ops.push({
            type: 'set',
            collection: 'bills',
            id: nextBillId,
            data: {
              ...template,
              cycle,
              dueDate: addMonths(bill.dueDate, months),
              status: 'pending',
              // Next cycle's utility amount is unknown until the biller is polled again.
              estimated: bill.kind === 'utility',
              createdAt: Date.now(),
            },
          });
        }
        ops.push({ type: 'update', collection: 'bills', id: bill.id, data: { status: 'paid', paidOn: today, transactionId: txId, nextBillId } });
        return ops;
      }, `${bill.title} paid · balance synced`),
    [guarded, requireAccount, store, rates],
  );

  /** True when this biller's bill for `billingMonth` has already been paid in WalletZen. */
  const isMonthPaid = useCallback(
    (provider, identifier, billingMonth) =>
      bills.some(
        (b) => b.kind === 'utility' && b.status === 'paid' && b.provider === provider && b.consumerId === identifier && b.billingMonth === billingMonth,
      ),
    [bills],
  );

  /**
   * "Fetch Latest Bill": queries the aggregator, then creates or refreshes the pending bill for this biller so it
   * appears in Upcoming right away. Throws on lookup errors (shown inline by the form).
   * Resolves to { result, billId, alreadyPaid }.
   */
  const fetchLatestUtilityBill = useCallback(
    async ({ provider, idType, identifier, areaCode, accountId, title, billId }) => {
      const result = await fetchUtilityBill({ provider, idType, identifier, areaCode });
      const consumerId = result.identifier;
      if (result.status === 'paid' || isMonthPaid(provider, consumerId, result.billingMonth)) {
        return { result, billId: null, alreadyPaid: true };
      }

      // Owner details saved earlier for this reference carry over when the service returns none (demo / manual).
      const knownOwner = bills.find((b) => b.provider === provider && b.consumerId === consumerId && b.owner)?.owner;
      const existing =
        (billId && bills.find((b) => b.id === billId && b.status === 'pending')) ||
        bills.find((b) => b.kind === 'utility' && b.status === 'pending' && b.provider === provider && b.consumerId === consumerId);
      const data = {
        kind: 'utility',
        title: title?.trim() || `${UTILITY_PROVIDERS[provider].label} bill`,
        currency: 'PKR',
        cycle: 'monthly',
        category: 'utility',
        provider,
        idType,
        consumerId,
        accountId: accountId || null,
        ...(knownOwner && { owner: knownOwner }),
        ...fetchedBillFields(result),
      };
      const id = existing?.id ?? store.newId();
      const op = existing
        ? { type: 'update', collection: 'bills', id, data }
        : { type: 'set', collection: 'bills', id, data: { ...data, status: 'pending', createdAt: Date.now() } };
      const ok = await run([op], `${UTILITY_PROVIDERS[provider].label} bill added to Upcoming`);
      return { result, billId: ok ? id : null, alreadyPaid: false };
    },
    [bills, isMonthPaid, run, store],
  );

  /** Re-polls every pending utility bill that hasn't been checked recently. */
  const syncUtilityBills = useCallback(
    async ({ force = false } = {}) => {
      if (!store) return;
      const due = bills.filter(
        (b) =>
          b.kind === 'utility' &&
          b.status === 'pending' &&
          b.consumerId &&
          (force || Date.now() - (b.lastSyncedAt ?? 0) >= SYNC_INTERVAL_MS),
      );
      for (const bill of due) {
        let data;
        try {
          const result = await fetchUtilityBill({ provider: bill.provider, idType: bill.idType ?? 'reference', identifier: bill.consumerId });
          // The biller still shows the month we already paid — next month's bill isn't out yet.
          data = isMonthPaid(bill.provider, bill.consumerId, result.billingMonth)
            ? { lastSyncedAt: Date.now(), syncError: null }
            : fetchedBillFields(result);
        } catch (error) {
          data = { lastSyncedAt: Date.now(), syncError: error.message };
        }
        await store.commit([{ type: 'update', collection: 'bills', id: bill.id, data }]).catch(() => {});
      }
      if (force) setToast({ type: 'success', message: `Checked ${due.length} utility bill${due.length === 1 ? '' : 's'}`, id: Date.now() });
    },
    [bills, isMonthPaid, store],
  );

  // Auto-poll utility bills once data is loaded (each bill is throttled by SYNC_INTERVAL_MS).
  useEffect(() => {
    if (ready) syncUtilityBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ---------- Screenshot import ----------

  /**
   * Imports reviewed scanner rows in one atomic batch. `balanceSyncs` ([{ accountId, balance }]) sets an
   * account to the balance shown on its latest screenshot, recorded as a balance correction.
   */
  const importScannedTransactions = useCallback(
    (rows, balanceSyncs = []) =>
      guarded(() => {
        if (!rows.length && !balanceSyncs.length) throw new Error('Nothing selected to import.');
        const ops = [];
        const deltas = {};
        for (const row of rows) {
          requireAccount(row.accountId);
          const tx = {
            type: row.type,
            amount: Number(row.amount),
            category: row.category,
            accountId: row.accountId,
            note: row.note?.trim() ?? '',
            date: row.date,
            reference: row.reference || null,
            source: 'scanner',
            createdAt: Date.now(),
          };
          ops.push({ type: 'set', collection: 'transactions', id: store.newId(), data: tx });
          for (const { accountId, delta } of transactionEffects(tx)) deltas[accountId] = (deltas[accountId] ?? 0) + delta;
        }
        for (const [accountId, delta] of Object.entries(deltas)) ops.push(balanceOp(accountId, delta));
        for (const { accountId, balance } of balanceSyncs) {
          requireAccount(accountId);
          const correction = balance - ((accountsById[accountId].balance ?? 0) + (deltas[accountId] ?? 0));
          if (correction !== 0) {
            ops.push({ type: 'update', collection: 'accounts', id: accountId, increment: { balance: correction, openingBalance: correction } });
          }
        }
        return ops;
      }, `Imported ${rows.length} transaction${rows.length === 1 ? '' : 's'}`),
    [guarded, requireAccount, store, accountsById],
  );

  // ---------- Commattie (rotating savings committees) ----------

  const saveCommittee = useCallback(
    ({ id, name, contribution, members, payoutMonth, startDate, accountId }) => {
      const data = {
        name: name.trim(),
        contribution: Number(contribution),
        members: Number(members),
        payoutMonth: Number(payoutMonth),
        startDate,
        accountId: accountId || null,
      };
      if (id) return run([{ type: 'update', collection: 'committees', id, data }], 'Commattie updated');
      return run(
        [{ type: 'set', collection: 'committees', id: store.newId(), data: { ...data, paidCount: 0, received: false, createdAt: Date.now() } }],
        'Commattie added',
      );
    },
    [run, store],
  );

  const deleteCommittee = useCallback((id) => run([{ type: 'delete', collection: 'committees', id }], 'Commattie removed'), [run]);

  const payCommitteeInstallment = useCallback(
    (committee) =>
      guarded(() => {
        requireAccount(committee.accountId);
        if (committee.paidCount >= committee.members) throw new Error('All installments are already paid.');
        const installment = committee.paidCount + 1;
        return [
          {
            type: 'set',
            collection: 'transactions',
            id: store.newId(),
            data: {
              type: 'expense',
              amount: committee.contribution,
              category: 'commattie',
              accountId: committee.accountId,
              note: `${committee.name} — installment ${installment}/${committee.members}`,
              date: todayISO(),
              committeeId: committee.id,
              committeeEvent: 'installment',
              createdAt: Date.now(),
            },
          },
          balanceOp(committee.accountId, -committee.contribution),
          { type: 'update', collection: 'committees', id: committee.id, increment: { paidCount: 1 } },
        ];
      }, 'Installment paid'),
    [guarded, requireAccount, store],
  );

  const receiveCommitteePayout = useCallback(
    (committee) =>
      guarded(() => {
        requireAccount(committee.accountId);
        const pot = committee.contribution * committee.members;
        return [
          {
            type: 'set',
            collection: 'transactions',
            id: store.newId(),
            data: {
              type: 'income',
              amount: pot,
              category: 'commattie_payout',
              accountId: committee.accountId,
              note: `${committee.name} — payout`,
              date: todayISO(),
              committeeId: committee.id,
              committeeEvent: 'payout',
              createdAt: Date.now(),
            },
          },
          balanceOp(committee.accountId, pot),
          { type: 'update', collection: 'committees', id: committee.id, data: { received: true } },
        ];
      }, 'Payout received'),
    [guarded, requireAccount, store],
  );

  // ---------- Contacts & loan ledger (debts / receivables) ----------

  const saveContact = useCallback(
    ({ id, name, phone, email, note, category }) =>
      guarded(() => {
        if (!name?.trim()) throw new Error('Enter a name.');
        if (!CONTACT_CATEGORIES[category]) throw new Error('Choose a category.');
        const data = { name: name.trim(), phone: phone?.trim() || null, email: email?.trim() || null, note: note?.trim() || null, category };
        return [
          id
            ? { type: 'update', collection: 'contacts', id, data }
            : { type: 'set', collection: 'contacts', id: store.newId(), data: { ...data, createdAt: Date.now() } },
        ];
      }, id ? 'Contact updated' : 'Contact added'),
    [guarded, store],
  );

  /** Removes the contact and its loan history. Account balances are left as they are (the money did move). */
  const deleteContact = useCallback(
    (id) =>
      run(
        [
          { type: 'delete', collection: 'contacts', id },
          ...ledger.filter((e) => e.contactId === id).map((e) => ({ type: 'delete', collection: 'ledger', id: e.id })),
          ...transactions.filter((t) => t.contactId === id).map((t) => ({ type: 'update', collection: 'transactions', id: t.id, data: { contactId: null } })),
        ],
        'Contact deleted',
      ),
    [run, ledger, transactions],
  );

  /** Ledger balance ops undoing `previous` and applying `next` (either may be null), skipping deleted accounts. */
  const rebalanceLedger = useCallback(
    (previous, next) => {
      const effects = [
        ...(previous ? ledgerEffects(previous).map((e) => ({ ...e, delta: -e.delta })) : []),
        ...(next ? ledgerEffects(next) : []),
      ];
      return balanceOps(effects, { skip: new Set(effects.map((e) => e.accountId).filter((id) => !accountsById[id])) });
    },
    [accountsById],
  );

  /**
   * A loan entry with a contact: lent / borrowed / collected / repaid. With an account linked, that account's
   * balance moves too; either way it is never counted as income or expense.
   */
  const saveLedgerEntry = useCallback(
    ({ id, contactId, kind, amount, accountId, date, note }) =>
      guarded(() => {
        if (!contactsById[contactId]) throw new Error('Choose a contact.');
        if (!LEDGER_KINDS[kind]) throw new Error('Choose what happened.');
        if (accountId) requireAccount(accountId);
        const next = { contactId, kind, amount: Number(amount), accountId: accountId || null, date, note: note?.trim() ?? '' };
        const previous = id ? ledger.find((e) => e.id === id) : null;
        return [
          id
            ? { type: 'update', collection: 'ledger', id, data: next }
            : { type: 'set', collection: 'ledger', id: store.newId(), data: { ...next, createdAt: Date.now() } },
          ...rebalanceLedger(previous, next),
        ];
      }, id ? 'Entry updated' : `${LEDGER_KINDS[kind]?.verb ?? 'Entry'} recorded`),
    [guarded, contactsById, requireAccount, store, ledger, rebalanceLedger],
  );

  const deleteLedgerEntry = useCallback(
    (entry) => run([{ type: 'delete', collection: 'ledger', id: entry.id }, ...rebalanceLedger(entry, null)], 'Entry deleted'),
    [run, rebalanceLedger],
  );

  /** Settles an item from the merged upcoming list, whichever kind it is. */
  const settleUpcoming = useCallback(
    (item) => (item.kind === 'bill' ? markBillPaid(item.source) : payCommitteeInstallment(item.source)),
    [markBillPaid, payCommitteeInstallment],
  );

  const value = useMemo(
    () => ({
      ready,
      accounts,
      accountsById,
      transactions,
      bills,
      committees,
      contacts,
      contactsById,
      ledger,
      upcoming,
      ...totals,
      toast,
      dismissToast: () => setToast(null),
      saveAccount,
      deleteAccount,
      saveTransaction,
      clearTransaction,
      saveTransfer,
      deleteTransaction,
      saveContact,
      deleteContact,
      saveLedgerEntry,
      deleteLedgerEntry,
      saveBill,
      deleteBill,
      markBillPaid,
      syncUtilityBills,
      fetchLatestUtilityBill,
      importScannedTransactions,
      saveCommittee,
      deleteCommittee,
      payCommitteeInstallment,
      receiveCommitteePayout,
      settleUpcoming,
    }),
    [
      ready, accounts, accountsById, transactions, bills, committees, contacts, contactsById, ledger, upcoming, totals, toast,
      saveAccount, deleteAccount, saveTransaction, clearTransaction, saveTransfer, deleteTransaction,
      saveContact, deleteContact, saveLedgerEntry, deleteLedgerEntry,
      saveBill, deleteBill, markBillPaid, syncUtilityBills, fetchLatestUtilityBill, importScannedTransactions,
      saveCommittee, deleteCommittee, payCommitteeInstallment, receiveCommitteePayout, settleUpcoming,
    ],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used inside <FinanceProvider>');
  return context;
}
