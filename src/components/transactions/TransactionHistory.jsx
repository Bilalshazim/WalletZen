import { useMemo, useState } from 'react';
import { ArrowLeftRight, Clock, ReceiptText, Search } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import AccountIcon from '../common/AccountIcon';
import IconCircle from '../common/IconCircle';
import SegmentedControl from '../common/SegmentedControl';
import TransactionForm from './TransactionForm';
import TransferModal from '../accounts/TransferModal';
import { useFinance } from '../../context/FinanceContext';
import { isCleared } from '../../utils/analytics';
import { getCategory } from '../../utils/constants';
import { cx, formatCurrency, formatDate, todayISO } from '../../utils/formatters';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'pending', label: 'Pending' },
];

const TRANSFER_CATEGORY = { label: 'Transfer', icon: ArrowLeftRight, color: '#9085E9' };

function AccountChip({ account }) {
  return account ? (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-ink/5 py-px pl-px pr-2">
      <AccountIcon account={account} size="xs" />
      <span className="truncate">{account.name}</span>
    </span>
  ) : (
    <span className="truncate">Deleted account</span>
  );
}

function TransactionRow({ tx, accountsById, contact, onSelect }) {
  const { clearTransaction } = useFinance();
  const [clearing, setClearing] = useState(false);
  const isTransfer = tx.type === 'transfer';
  const { label, icon, color } = isTransfer ? TRANSFER_CATEGORY : getCategory(tx.type, tx.category);
  const isIncome = tx.type === 'income';
  const pending = !isCleared(tx);
  const account = accountsById[tx.accountId];
  const target = isTransfer ? accountsById[tx.toAccountId] : null;

  const clear = async () => {
    setClearing(true);
    await clearTransaction(tx);
    setClearing(false);
  };

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onSelect(tx)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-ink/5"
      >
        <IconCircle icon={icon} color={color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {tx.note || (isTransfer ? `To ${target?.name ?? 'deleted account'}` : contact?.name ?? label)}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink/45">
            {pending ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-px font-medium text-amber-700 dark:text-amber-300">
                <Clock size={10} /> {isIncome ? 'Expected' : 'Unpaid'}
              </span>
            ) : (
              <span className="shrink-0">{label}</span>
            )}
            <span aria-hidden="true">·</span>
            {isTransfer ? (
              // Two chips don't fit on a phone; plain names truncate gracefully.
              <span className="truncate">
                {account?.name ?? 'Deleted account'} → {target?.name ?? 'Deleted account'}
              </span>
            ) : (
              <AccountChip account={account} />
            )}
          </p>
        </div>
        <span
          className={cx(
            'whitespace-nowrap text-sm font-semibold tabular-nums',
            pending ? 'text-ink/40' : isTransfer ? 'text-ink/70' : isIncome ? 'text-accent' : 'text-ink',
          )}
        >
          {isTransfer ? formatCurrency(tx.amount) : formatCurrency(isIncome ? tx.amount : -tx.amount)}
        </span>
      </button>
      {pending && (
        <Button size="sm" variant="secondary" loading={clearing} onClick={clear} aria-label={`Mark ${tx.note || label} as ${isIncome ? 'received' : 'paid'}`}>
          {isIncome ? 'Received' : 'Paid'}
        </Button>
      )}
    </li>
  );
}

const dayLabel = (iso) => {
  if (iso === todayISO()) return 'Today';
  return formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

/** Transaction list. With `limit` it renders a compact "recent" card; otherwise a full, filterable history. */
export default function TransactionHistory({ limit, onShowAll }) {
  const { transactions, accountsById, contactsById } = useFinance();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const visible = useMemo(() => {
    if (limit) return transactions.slice(0, limit);
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filter === 'pending' ? isCleared(tx) : filter !== 'all' && tx.type !== filter) return false;
      if (!q) return true;
      return [tx.note, getCategory(tx.type, tx.category).label, accountsById[tx.accountId]?.name, contactsById[tx.contactId]?.name]
        .some((text) => text?.toLowerCase().includes(q));
    });
  }, [transactions, accountsById, contactsById, filter, query, limit]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const tx of visible) map.set(tx.date, [...(map.get(tx.date) ?? []), tx]);
    return [...map.entries()];
  }, [visible]);

  const renderRow = (tx) => (
    <TransactionRow key={tx.id} tx={tx} accountsById={accountsById} contact={contactsById[tx.contactId]} onSelect={setEditing} />
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

      <TransactionForm open={Boolean(editing) && editing.type !== 'transfer'} transaction={editing} onClose={() => setEditing(null)} />
      <TransferModal open={editing?.type === 'transfer'} transfer={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}
