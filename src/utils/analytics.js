import { getCategory, LEDGER_KINDS } from './constants';
import { addMonths, daysUntil, monthKey, toISODate, todayISO } from './formatters';

// ---------- Realized vs projected ----------
//
// A transaction is *cleared* (realized) unless it is explicitly `status: 'pending'` — entries saved before the
// status field existed were all applied to balances, so they count as cleared. Only cleared entries move account
// balances; pending ones (future-dated salary, a bill you haven't paid yet) are *projected*.

export const isCleared = (tx) => tx.status !== 'pending';

/** Routine income/expense (not transfers between your own accounts). */
export const isFlow = (tx) => tx.type === 'income' || tx.type === 'expense';

/** Counts towards income/expense totals: routine and already cleared. */
const isRealizedFlow = (tx) => isFlow(tx) && isCleared(tx);

/** Balance changes a transaction applies to accounts: [{ accountId, delta }]. Pending entries apply none. */
export function transactionEffects(tx) {
  if (!isCleared(tx)) return [];
  if (tx.type === 'transfer') {
    return [
      { accountId: tx.accountId, delta: -tx.amount },
      { accountId: tx.toAccountId, delta: tx.amount },
    ];
  }
  return [{ accountId: tx.accountId, delta: tx.type === 'income' ? tx.amount : -tx.amount }];
}

/** Balance change a loan ledger entry applies to its linked account (none when no account is linked). */
export function ledgerEffects(entry) {
  const kind = LEDGER_KINDS[entry.kind];
  return kind && entry.accountId ? [{ accountId: entry.accountId, delta: kind.cash * entry.amount }] : [];
}

/** How a ledger entry changes what the contact owes you (+ = they owe you more). */
export const ledgerOwedDelta = (entry) => (LEDGER_KINDS[entry.kind]?.owed ?? 0) * entry.amount;

/** Running balance per contact id: positive = receivable (they owe you), negative = payable (you owe them). */
export function contactBalances(ledger) {
  const balances = {};
  for (const entry of ledger) balances[entry.contactId] = (balances[entry.contactId] ?? 0) + ledgerOwedDelta(entry);
  return balances;
}

/** Totals across all contacts: { receivable, payable } (both positive numbers). */
export function debtTotals(balances) {
  return Object.values(balances).reduce(
    (acc, value) => {
      if (value > 0) acc.receivable += value;
      else acc.payable -= value;
      return acc;
    },
    { receivable: 0, payable: 0 },
  );
}

export const PROJECTION_DAYS = 30;

/**
 * Money expected but not yet realized: pending income, plus pending expenses and planner items (bills,
 * subscriptions, Commattie installments) due within the next PROJECTION_DAYS. Overdue items are included.
 */
export function projection(transactions, upcoming) {
  const horizon = toISODate(new Date(Date.now() + PROJECTION_DAYS * 864e5));
  const pending = transactions.filter((tx) => !isCleared(tx) && isFlow(tx));
  const pendingIncome = pending.filter((tx) => tx.type === 'income');
  const pendingExpense = pending.filter((tx) => tx.type === 'expense' && tx.date <= horizon);
  const plannerDue = upcoming.filter((item) => item.amount > 0 && item.dueDate <= horizon);
  const income = pendingIncome.reduce((sum, tx) => sum + tx.amount, 0);
  const expense = pendingExpense.reduce((sum, tx) => sum + tx.amount, 0) + plannerDue.reduce((sum, item) => sum + item.amount, 0);
  return { income, expense, net: income - expense, incomeCount: pendingIncome.length, expenseCount: pendingExpense.length + plannerDue.length };
}

/** The last `count` month keys ('YYYY-MM'), oldest first, ending with the current month. */
export function recentMonths(count) {
  const current = `${monthKey(todayISO())}-01`;
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(current, i - count + 1)));
}

const monthEnd = (key) => {
  const [y, m] = key.split('-').map(Number);
  return toISODate(new Date(y, m, 0));
};

export function monthSummary(transactions, key = monthKey(todayISO())) {
  return transactions.reduce(
    (acc, tx) => {
      if (isRealizedFlow(tx) && monthKey(tx.date) === key) acc[tx.type] += tx.amount;
      return acc;
    },
    { income: 0, expense: 0 },
  );
}

/** Realized income/expense totals (and entry count) for transactions dated within [from, to], inclusive. */
export function rangeSummary(transactions, from, to) {
  return transactions.reduce(
    (acc, tx) => {
      if (isRealizedFlow(tx) && tx.date >= from && tx.date <= to) {
        acc[tx.type] += tx.amount;
        acc.count += 1;
      }
      return acc;
    },
    { income: 0, expense: 0, count: 0 },
  );
}

/** Resolves a period id ('month' | '30d' | 'custom') to an inclusive { from, to } date range. */
export function periodRange(period, custom) {
  const today = todayISO();
  if (period === '30d') {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return { from: toISODate(start), to: today };
  }
  if (period === 'custom' && custom?.from && custom?.to) {
    return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }
  return { from: `${monthKey(today)}-01`, to: today };
}

export function cashFlowSeries(transactions, months = 6) {
  return recentMonths(months).map((key) => {
    const { income, expense } = monthSummary(transactions, key);
    return { key, income, expense, net: income - expense };
  });
}

/**
 * Net worth (savings + receivables − debts) at the end of each month, reconstructed backwards from today:
 * undo every savings-account balance change and every loan entry dated after that month, and every savings
 * vault opened after it.
 */
export function netWorthTrend({ transactions, ledger, accounts, netWorth }, months = 6) {
  const savingsIds = new Set(accounts.filter((a) => a.type === 'savings').map((a) => a.id));
  const savingsDelta = (effects) => effects.reduce((sum, e) => sum + (savingsIds.has(e.accountId) ? e.delta : 0), 0);
  return recentMonths(months).map((key) => {
    const end = monthEnd(key);
    const later = (item) => item.date > end;
    const laterSavings =
      transactions.filter(later).reduce((sum, tx) => sum + savingsDelta(transactionEffects(tx)), 0) +
      ledger.filter(later).reduce((sum, entry) => sum + savingsDelta(ledgerEffects(entry)), 0);
    const laterDebt = ledger.filter(later).reduce((sum, entry) => sum + ledgerOwedDelta(entry), 0);
    const laterOpenings = accounts
      .filter((a) => savingsIds.has(a.id) && a.openedOn > end)
      .reduce((sum, a) => sum + (a.openingBalance ?? 0), 0);
    return { key, value: netWorth - laterSavings - laterDebt - laterOpenings };
  });
}

export function spendingBreakdown(transactions, key = monthKey(todayISO())) {
  const totals = {};
  for (const tx of transactions) {
    if (isRealizedFlow(tx) && tx.type === 'expense' && monthKey(tx.date) === key) totals[tx.category] = (totals[tx.category] ?? 0) + tx.amount;
  }
  const sorted = Object.entries(totals)
    .map(([id, value]) => ({ id, value, ...getCategory('expense', id) }))
    .sort((a, b) => b.value - a.value);

  // The palette has 8 validated hues for 9 heads: never show a hue twice or more than 7 slices —
  // the overflow folds into a neutral "Other" slice.
  const shown = [];
  let other = 0;
  for (const slice of sorted) {
    if (shown.length < 7 && !shown.some((s) => s.color === slice.color)) shown.push(slice);
    else other += slice.value;
  }
  if (other > 0) shown.push({ id: 'other', label: 'Other', color: '#8A8F98', value: other });
  return shown;
}

/** Bills created before cycles/currencies existed only carried `recurrence`. */
export const billCycle = (bill) => bill.cycle ?? (bill.recurrence === 'monthly' ? 'monthly' : 'once');

/**
 * A bill's amount in PKR — foreign currencies convert at the user's rates ({ USD, EUR }).
 * Null until a utility bill's amount is known.
 */
export function billAmountPKR(bill, rates) {
  if (bill.amount == null) return null;
  const currency = bill.currency ?? 'PKR';
  return currency === 'PKR' ? bill.amount : Math.round(bill.amount * (rates[currency] ?? 0));
}

/** Pending bills/subscriptions and next committee installments, merged into one due-date-ordered list. */
export function upcomingItems(bills, committees, rates) {
  const fromBills = bills
    .filter((b) => b.status === 'pending')
    .map((b) => ({
      key: `bill:${b.id}`,
      kind: 'bill',
      source: b,
      title: b.title,
      amount: billAmountPKR(b, rates),
      originalAmount: b.amount,
      currency: b.currency ?? 'PKR',
      category: b.category,
      dueDate: b.dueDate,
      accountId: b.accountId,
    }));

  const fromCommittees = committees
    .filter((c) => c.paidCount < c.members)
    .map((c) => ({
      key: `committee:${c.id}`,
      kind: 'committee',
      source: c,
      title: `${c.name} · ${c.paidCount + 1}/${c.members}`,
      amount: c.contribution,
      originalAmount: c.contribution,
      currency: 'PKR',
      category: 'commattie',
      dueDate: addMonths(c.startDate, c.paidCount),
      accountId: c.accountId,
    }));

  return [...fromBills, ...fromCommittees].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const DUE_SOON_DAYS = 5;

/** Payment status of an unpaid bill from its due date: 'overdue' | 'dueSoon' | 'unpaid'. */
export function billStatus(dueDate) {
  const days = daysUntil(dueDate);
  if (days < 0) return 'overdue';
  return days <= DUE_SOON_DAYS ? 'dueSoon' : 'unpaid';
}
