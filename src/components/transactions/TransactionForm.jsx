import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SegmentedControl from '../common/SegmentedControl';
import { AmountInput, Field, Input, Select } from '../common/FormField';
import CategoryBadge from './CategoryBadge';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES, CATEGORY_GROUPS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../utils/constants';
import { formatCurrency, todayISO } from '../../utils/formatters';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense', activeClass: 'bg-rose-500/90 text-white shadow-md' },
  { value: 'income', label: 'Income' },
];

function FormBody({ transaction, defaultType, onClose }) {
  const { accounts, contacts, saveTransaction, deleteTransaction } = useFinance();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    type: transaction?.type ?? defaultType,
    amount: transaction ? String(transaction.amount) : '',
    category: transaction?.category ?? (defaultType === 'income' ? 'salary' : 'food'),
    accountId: transaction?.accountId ?? accounts[0]?.id ?? '',
    date: transaction?.date ?? todayISO(),
    note: transaction?.note ?? '',
    status: transaction?.status ?? 'cleared',
    contactId: transaction?.contactId ?? '',
  }));
  // Future-dated entries are always projected; they only count once marked received/paid.
  const future = form.date > todayISO();
  const pending = future || form.status === 'pending';
  const isIncome = form.type === 'income';

  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const switchType = (type) =>
    setForm((prev) => ({ ...prev, type, category: type === 'income' ? 'salary' : 'food' }));

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    setBusy(true);
    const ok = await saveTransaction({ ...form, id: transaction?.id });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm('Delete this transaction? The account balance will be restored.')) return;
    setBusy(true);
    if (await deleteTransaction(transaction)) onClose();
    else setBusy(false);
  };

  if (accounts.length === 0) {
    return <p className="py-6 text-center text-sm text-ink/60">Add an account first — every entry is linked to one.</p>;
  }

  const categoryChips = (entries) =>
    entries.map(([id]) => (
      <CategoryBadge
        key={id}
        type={form.type}
        category={id}
        selected={form.category === id}
        onClick={() => set('category')(id)}
      />
    ));

  return (
    <form onSubmit={submit} className="space-y-5">
      <SegmentedControl options={TYPE_OPTIONS} value={form.type} onChange={switchType} />
      <AmountInput value={form.amount} onChange={set('amount')} autoFocus={!transaction} />

      <div className="space-y-3">
        {form.type === 'income' ? (
          <div className="flex flex-wrap gap-2">{categoryChips(Object.entries(INCOME_CATEGORIES))}</div>
        ) : (
          CATEGORY_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {categoryChips(Object.entries(EXPENSE_CATEGORIES).filter(([, c]) => c.group === group.id))}
              </div>
            </div>
          ))
        )}
      </div>

      <Field label={form.type === 'income' ? 'Deposit to' : 'Pay from'}>
        <Select value={form.accountId} onChange={(e) => set('accountId')(e.target.value)} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {ACCOUNT_TYPES[a.type]?.label} · {formatCurrency(a.balance)}
            </option>
          ))}
        </Select>
      </Field>

      {contacts.length > 0 && (
        <Field label={isIncome ? 'Received from (optional)' : 'Paid to (optional)'}>
          <Select value={form.contactId} onChange={(e) => set('contactId')(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={form.date} max="9999-12-31" onChange={(e) => set('date')(e.target.value)} required />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => set('note')(e.target.value)} placeholder="Optional" maxLength={80} />
        </Field>
      </div>

      <div className="space-y-2">
        <SegmentedControl
          size="sm"
          value={pending ? 'pending' : 'cleared'}
          onChange={(value) => !future && set('status')(value)}
          options={[
            { value: 'cleared', label: isIncome ? 'Received' : 'Paid' },
            { value: 'pending', label: isIncome ? 'Expected (pending)' : 'Not paid yet' },
          ]}
        />
        <p className="text-xs text-ink/50">
          {pending
            ? `${future ? 'Future date — ' : ''}Shown as projected. Your balance won't change until you mark it ${isIncome ? 'received' : 'paid'}.`
            : `Counts in your current balance now.`}
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        {transaction && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {transaction ? 'Save changes' : pending ? `Schedule ${form.type}` : `Add ${form.type}`}
        </Button>
      </div>
    </form>
  );
}

/** Fast entry modal for income and expenses. Pass `transaction` to edit an existing entry. */
export default function TransactionForm({ open, onClose, transaction, defaultType = 'expense' }) {
  return (
    <Modal open={open} onClose={onClose} title={transaction ? 'Edit transaction' : 'New transaction'}>
      <FormBody transaction={transaction} defaultType={defaultType} onClose={onClose} />
    </Modal>
  );
}
