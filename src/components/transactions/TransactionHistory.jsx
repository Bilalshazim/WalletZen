import { useMemo, useState } from 'react';
import { ReceiptText, Search } from 'lucide-react';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import AccountIcon from '../common/AccountIcon';
import IconCircle from '../common/IconCircle';
import SegmentedControl from '../common/SegmentedControl';
import TransactionForm from './TransactionForm';
import { useFinance } from '../../context/FinanceContext';
import { getCategory } from '../../utils/constants';
import { cx, formatCurrency, formatDate, todayISO } from '../../utils/formatters';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

function TransactionRow({ tx, account, onSelect }) {
  const { label, icon, color } = getCategory(tx.type, tx.category);
  const isIncome = tx.type === 'income';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(tx)}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-ink/5"
      >
        <IconCircle icon={icon} color={color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{tx.note || label}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink/45">
            <span className="shrink-0">{label}</span>
            <span aria-hidden="true">·</span>
            {account ? (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-ink/5 py-px pl-px pr-2">
                <AccountIcon account={account} size="xs" />
                <span className="truncate">{account.name}</span>
              </span>
            ) : (
              <span className="truncate">Deleted account</span>
            )}
          </p>
        </div>
        <span className={cx('text-sm font-semibold tabular-nums', isIncome ? 'text-accent' : 'text-ink')}>
          {formatCurrency(isIncome ? tx.amount : -tx.amount)}
        </span>
      </button>
    </li>
  );
}

const dayLabel = (iso) => {
  if (iso === todayISO()) return 'Today';
  return formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

/** Transaction list. With `limit` it renders a compact "recent" card; otherwise a full, filterable history. */
export default function TransactionHistory({ limit, onShowAll }) {
  const { transactions, accountsById } = useFinance();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const visible = useMemo(() => {
    if (limit) return transactions.slice(0, limit);
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filter !== 'all' && tx.type !== filter) return false;
      if (!q) return true;
      return [tx.note, getCategory(tx.type, tx.category).label, accountsById[tx.accountId]?.name]
        .some((text) => text?.toLowerCase().includes(q));
    });
  }, [transactions, accountsById, filter, query, limit]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const tx of visible) map.set(tx.date, [...(map.get(tx.date) ?? []), tx]);
    return [...map.entries()];
  }, [visible]);

  const renderRow = (tx) => (
    <TransactionRow key={tx.id} tx={tx} account={accountsById[tx.accountId]} onSelect={setEditing} />
  );

  return (
    <Card
      title={limit ? 'Recent activity' : 'Transaction history'}
      subtitle={limit ? undefined : `${visible.length} entr${visible.length === 1 ? 'y' : 'ies'}`}
      action={
        limit && transactions.length > limit ? (
          <button type="button" onClick={onShowAll} className="text-xs font-medium text-accent hover:underline">
            See all
          </button>
        ) : null
      }
    >
      {!limit && (
        <div className="mb-4 space-y-3">
          <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} size="sm" />
          <label className="flex items-center gap-2 rounded-full border border-ink/10 bg-ink/5 px-4 py-2.5">
            <Search size={16} className="text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes, categories, accounts"
              className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink/30 sm:text-sm"
            />
          </label>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={transactions.length ? 'No matching transactions' : 'No transactions yet'}
          message={transactions.length ? 'Try a different filter.' : 'Tap the + button to record your first entry.'}
        />
      ) : limit ? (
        <ul className="-mx-2">{visible.map(renderRow)}</ul>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, items]) => (
            <section key={date}>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/40">{dayLabel(date)}</h3>
              <ul className="-mx-2">{items.map(renderRow)}</ul>
            </section>
          ))}
        </div>
      )}

      <TransactionForm open={Boolean(editing)} transaction={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
