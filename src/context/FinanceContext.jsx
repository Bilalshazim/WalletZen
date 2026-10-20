import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { COLLECTIONS, createStore } from '../services/storageService';
import { useSettings } from './SettingsContext';
import { cleanOwner, fetchUtilityBill, SYNC_INTERVAL_MS } from '../services/billAggregatorApi';
import { billAmountPKR, billCycle, upcomingItems } from '../utils/analytics';
import { BILLING_CYCLES, UTILITY_PROVIDERS } from '../utils/constants';
import { addMonths, formatMoney, todayISO } from '../utils/formatters';

const FinanceContext = createContext(null);

const EMPTY = { accounts: [], transactions: [], bills: [], committees: [] };

const byCreated = (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0);
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
const byDueDate = (a, b) => a.dueDate.localeCompare(b.dueDate);

const balanceOp = (accountId, delta) => ({
  type: 'update',
  collection: 'accounts',
  id: accountId,
  increment: { balance: delta },
});

const signed = (tx) => (tx.type === 'income' ? tx.amount : -tx.amount);

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

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const netWorth = useMemo(() => accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0), [accounts]);
  const upcoming = useMemo(() => upcomingItems(bills, committees, rates), [bills, committees, rates]);

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
      const ops = [
        { type: 'delete', collection: 'accounts', id },
        ...transactions.filter((t) => t.accountId === id).map((t) => ({ type: 'delete', collection: 'transactions', id: t.id })),
        ...bills.filter((b) => b.accountId === id).map((b) => ({ type: 'update', collection: 'bills', id: b.id, data: { accountId: null } })),
        ...committees
          .filter((c) => c.accountId === id)
          .map((c) => ({ type: 'update', collection: 'committees', id: c.id, data: { accountId: null } })),
      ];
      return run(ops, 'Account deleted');
    },
    [run, transactions, bills, committees],
  );

  // ---------- Transactions ----------

  const saveTransaction = useCallback(
    ({ id, type, amount, category, accountId, note, date }) =>
      guarded(() => {
        requireAccount(accountId);
        const next = { type, amount: Number(amount), category, accountId, note: note?.trim() ?? '', date };
        const deltas = { [accountId]: signed(next) };

        if (!id) {
          const txId = store.newId();
          return [
            { type: 'set', collection: 'transactions', id: txId, data: { ...next, createdAt: Date.now() } },
            balanceOp(accountId, deltas[accountId]),
          ];
        }

        // Editing: reverse the old entry's effect, then apply the new one (accounts may differ).
        const previous = transactions.find((t) => t.id === id);
        if (previous && accountsById[previous.accountId]) {
          deltas[previous.accountId] = (deltas[previous.accountId] ?? 0) - signed(previous);
        }
        return [
          { type: 'update', collection: 'transactions', id, data: next },
          ...Object.entries(deltas)
            .filter(([, delta]) => delta !== 0)
            .map(([accId, delta]) => balanceOp(accId, delta)),
        ];
      }, id ? 'Transaction updated' : `${type === 'income' ? 'Income' : 'Expense'} recorded`),
    [guarded, requireAccount, store, transactions, accountsById],
  );

  const deleteTransaction = useCallback(
    (tx) => {
      const ops = [{ type: 'delete', collection: 'transactions', id: tx.id }];
      if (accountsById[tx.accountId]) ops.push(balanceOp(tx.accountId, -signed(tx)));

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
    [run, accountsById, bills, committees],
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
          deltas[row.accountId] = (deltas[row.accountId] ?? 0) + signed(tx);
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
      upcoming,
      netWorth,
      toast,
      dismissToast: () => setToast(null),
      saveAccount,
      deleteAccount,
      saveTransaction,
      deleteTransaction,
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
      ready, accounts, accountsById, transactions, bills, committees, upcoming, netWorth, toast,
      saveAccount, deleteAccount, saveTransaction, deleteTransaction, saveBill, deleteBill, markBillPaid, syncUtilityBills, fetchLatestUtilityBill, importScannedTransactions,
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
