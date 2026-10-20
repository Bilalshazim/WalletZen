import { getCategory } from './constants';
import { addMonths, daysUntil, monthKey, toISODate, todayISO } from './formatters';

const signed = (tx) => (tx.type === 'income' ? tx.amount : -tx.amount);

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
      if (monthKey(tx.date) === key) acc[tx.type] += tx.amount;
      return acc;
    },
    { income: 0, expense: 0 },
  );
}

/** Income/expense totals (and entry count) for transactions dated within [from, to], inclusive. */
export function rangeSummary(transactions, from, to) {
  return transactions.reduce(
    (acc, tx) => {
      if (tx.date >= from && tx.date <= to) {
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
 * Net worth at the end of each month, reconstructed backwards from today's balances:
 * remove every transaction dated after that month, and every account opened after it.
 */
export function netWorthTrend(transactions, accounts, netWorth, months = 6) {
  return recentMonths(months).map((key) => {
    const end = monthEnd(key);
    const laterFlow = transactions.filter((tx) => tx.date > end).reduce((sum, tx) => sum + signed(tx), 0);
    const laterOpenings = accounts
      .filter((a) => a.openedOn > end)
      .reduce((sum, a) => sum + (a.openingBalance ?? 0), 0);
    return { key, value: netWorth - laterFlow - laterOpenings };
  });
}

export function spendingBreakdown(transactions, key = monthKey(todayISO())) {
  const totals = {};
  for (const tx of transactions) {
    if (tx.type === 'expense' && monthKey(tx.date) === key) totals[tx.category] = (totals[tx.category] ?? 0) + tx.amount;
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
