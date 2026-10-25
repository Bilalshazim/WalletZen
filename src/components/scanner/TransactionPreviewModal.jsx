import { useMemo, useState } from 'react';
import { AlertTriangle, Copy, Scale } from 'lucide-react';
import AccountIcon from '../common/AccountIcon';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SegmentedControl from '../common/SegmentedControl';
import { Input, Select } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { getAccountIcon, getAccountIconFor } from '../../utils/accountIcons';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../utils/constants';
import { cx, formatCurrency, formatDate, todayISO } from '../../utils/formatters';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Debit', activeClass: 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/25 dark:text-rose-300' },
  { value: 'income', label: 'Credit' },
];

// Reduce "Meezan Bank Limited" / "Meezan Current" etc. to their distinctive part ("meezan").
const GENERIC_WORDS = /bank|limited|ltd|pakistan|islamic|wallet|account|current|savings|digital|mobile/g;
const core = (text) => (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(GENERIC_WORDS, '');

/**
 * Matches an extracted bank/wallet name to one of the user's accounts: first by resolved institution
 * (so "HBL" finds "Habib Bank Savings"), then by fuzzy name.
 */
function matchAccount(institution, accounts) {
  const brand = getAccountIcon(institution);
  if (brand.domain) {
    const sameInstitution = accounts.find((a) => getAccountIconFor(a).key === brand.key);
    if (sameInstitution) return sameInstitution.id;
  }
  const name = core(institution);
  if (name.length < 3) return '';
  const hit = accounts.find((a) =>
    [a.provider, a.name].map(core).some((c) => c.length >= 3 && (c.includes(name) || name.includes(c))),
  );
  return hit?.id ?? '';
}

function toRow(tx, index, accounts) {
  const type = tx.type === 'credit' ? 'income' : 'expense';
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return {
    id: index,
    include: true,
    imageIndex: tx.imageIndex,
    type,
    amount: String(tx.amount),
    date: /^\d{4}-\d{2}-\d{2}$/.test(tx.date ?? '') && tx.date <= todayISO() ? tx.date : todayISO(),
    category: categories[tx.category] ? tx.category : type === 'income' ? 'gift' : 'personal',
    accountId: matchAccount(tx.institution, accounts),
    note: tx.counterparty || tx.institution || '',
    reference: tx.reference || '',
    institution: tx.institution || 'Unknown',
    balanceAfter: tx.balanceAfter,
    confidence: tx.confidence ?? 1,
  };
}

/** Flags rows already recorded (same reference, or same account/type/amount/date) or repeated in this batch. */
function findDuplicates(rows, transactions) {
  const flags = {};
  const seen = new Map();
  for (const row of rows) {
    const amount = Number(row.amount);
    const key = row.reference ? `ref:${row.reference}` : `${row.accountId}|${row.type}|${amount}|${row.date}`;
    const existing = transactions.some(
      (t) =>
        (row.reference && t.reference === row.reference) ||
        (t.accountId === row.accountId && t.type === row.type && t.amount === amount && t.date === row.date),
    );
    if (existing) flags[row.id] = 'Already in your history';
    else if (seen.has(key)) flags[row.id] = 'Same as another screenshot';
    seen.set(key, row.id);
  }
  return flags;
}

function RowEditor({ row, preview, duplicate, accounts, onChange }) {
  const set = (field) => (value) => onChange(row.id, { [field]: value });
  const categories = row.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <li className={cx('rounded-xl border p-3 transition', row.include ? 'border-ink/10 bg-ink/5' : 'border-transparent bg-ink/[0.02] opacity-60')}>
      <div className="flex gap-3">
        <a href={preview} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={preview} alt={`Screenshot ${row.imageIndex + 1}`} className="h-20 w-14 rounded-xl border border-ink/10 object-cover object-top" />
        </a>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={row.include}
              onChange={(e) => set('include')(e.target.checked)}
              className="h-4 w-4 accent-zen-emerald"
              aria-label="Include this transaction"
            />
            <AccountIcon name={row.institution} size="sm" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{row.institution}</p>
            {row.confidence < 0.7 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                <AlertTriangle size={11} /> Check
              </span>
            )}
          </div>
          {duplicate && (
            <p className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
              <Copy size={11} /> {duplicate}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <SegmentedControl options={TYPE_OPTIONS} value={row.type} onChange={(type) => onChange(row.id, { type, category: type === 'income' ? 'gift' : 'personal' })} size="sm" />
            <Input type="number" inputMode="decimal" min="0" step="any" value={row.amount} onChange={(e) => set('amount')(e.target.value)} className="py-2" aria-label="Amount" />
            <Input type="date" value={row.date} max={todayISO()} onChange={(e) => set('date')(e.target.value)} className="py-2" aria-label="Date" />
            <Select value={row.category} onChange={(e) => set('category')(e.target.value)} className="py-2" aria-label="Category">
              {Object.entries(categories).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select
              value={row.accountId}
              onChange={(e) => set('accountId')(e.target.value)}
              className={cx('py-2', !row.accountId && row.include && 'border-amber-500/60')}
              aria-label="Account"
            >
              <option value="" disabled>
                Choose account
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Input value={row.note} onChange={(e) => set('note')(e.target.value)} placeholder="Note" maxLength={80} className="py-2" aria-label="Note" />
          </div>
        </div>
      </div>
    </li>
  );
}

function ReviewBody({ extracted, previews, failures, onClose, onImported }) {
  const { accounts, accountsById, transactions, importScannedTransactions } = useFinance();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(() => {
    const initial = extracted.map((tx, i) => toRow(tx, i, accounts));
    const dupes = findDuplicates(initial, transactions);
    return initial.map((r) => (dupes[r.id] ? { ...r, include: false } : r));
  });
  const [skipBalance, setSkipBalance] = useState({});

  const duplicates = useMemo(() => findDuplicates(rows, transactions), [rows, transactions]);
  const onChange = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.include);
  const invalid = selected.filter((r) => !r.accountId || !(Number(r.amount) > 0));
  const totals = selected.reduce(
    (acc, r) => ({ ...acc, [r.type]: acc[r.type] + (Number(r.amount) || 0) }),
    { income: 0, expense: 0 },
  );

  // Latest stated balance per account among selected rows (by date, then screenshot order).
  const balanceSyncs = useMemo(() => {
    const latest = {};
    for (const r of selected) {
      if (r.balanceAfter == null || !r.accountId) continue;
      const prev = latest[r.accountId];
      if (!prev || r.date > prev.date || (r.date === prev.date && r.imageIndex >= prev.imageIndex)) latest[r.accountId] = r;
    }
    return Object.entries(latest).map(([accountId, r]) => ({ accountId, balance: r.balanceAfter, date: r.date }));
  }, [selected]);

  const confirm = async () => {
    setBusy(true);
    const ok = await importScannedTransactions(
      selected.map(({ type, amount, category, accountId, note, date, reference }) => ({ type, amount, category, accountId, note, date, reference })),
      balanceSyncs.filter((b) => !skipBalance[b.accountId]),
    );
    setBusy(false);
    if (ok) onImported();
  };

  return (
    <div className="space-y-4">
      {failures.length > 0 && (
        <p className="rounded-xl bg-amber-400/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          {failures.map((f) => `Images ${f.from + 1}–${f.to + 1}: ${f.reason}`).join(' · ')}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink/60">No transactions were found in these images.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <RowEditor key={row.id} row={row} preview={previews[row.imageIndex]} duplicate={duplicates[row.id]} accounts={accounts} onChange={onChange} />
          ))}
        </ul>
      )}

      {balanceSyncs.length > 0 && (
        <div className="space-y-2 rounded-xl border border-ink/10 p-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink/50">
            <Scale size={14} /> Sync remaining balance from screenshots
          </p>
          {balanceSyncs.map(({ accountId, balance, date }) => (
            <label key={accountId} className="flex items-center gap-3 text-sm text-ink/80">
              <input
                type="checkbox"
                checked={!skipBalance[accountId]}
                onChange={(e) => setSkipBalance((prev) => ({ ...prev, [accountId]: !e.target.checked }))}
                className="h-4 w-4 accent-zen-emerald"
              />
              <span className="flex-1">
                Set <b>{accountsById[accountId]?.name}</b> to {formatCurrency(balance)}
                <span className="text-xs text-ink/45"> · as of {formatDate(date)}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-ink/10 bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:pb-5">
        <p className="mb-2 text-xs text-ink/60">
          {selected.length} selected · <span className="text-accent">+{formatCurrency(totals.income)}</span> ·{' '}
          <span>−{formatCurrency(totals.expense)}</span>
          {invalid.length > 0 && <span className="text-amber-700 dark:text-amber-300"> · {invalid.length} need an account or amount</span>}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="flex-1" loading={busy} disabled={invalid.length > 0 || (!selected.length && !balanceSyncs.length)} onClick={confirm}>
            Import & update balances
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Batch review of scanned transactions before they touch any balance. */
export default function TransactionPreviewModal({ open, onClose, extracted, previews, failures = [], onImported }) {
  return (
    <Modal open={open} onClose={onClose} title={`Review ${extracted.length} scanned transaction${extracted.length === 1 ? '' : 's'}`} size="lg">
      <ReviewBody extracted={extracted} previews={previews} failures={failures} onClose={onClose} onImported={onImported} />
    </Modal>
  );
}
