import { useState } from 'react';
import { ArrowDown, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { AmountInput, Field, Input, Select } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { formatCurrency, todayISO } from '../../utils/formatters';

function AccountSelect({ value, onChange, accounts }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="" disabled>
        Select account
      </option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {ACCOUNT_TYPES[a.type]?.label} · {formatCurrency(a.balance)}
        </option>
      ))}
    </Select>
  );
}

function FormBody({ transfer, toSavings, onClose }) {
  const { accounts, saveTransfer, deleteTransaction } = useFinance();
  const operational = accounts.filter((a) => a.type !== 'savings');
  const vaults = accounts.filter((a) => a.type === 'savings');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    fromAccountId: transfer?.accountId ?? operational[0]?.id ?? accounts[0]?.id ?? '',
    toAccountId: transfer?.toAccountId ?? (toSavings ? vaults[0]?.id : accounts.find((a) => a.id !== operational[0]?.id)?.id) ?? '',
    amount: transfer ? String(transfer.amount) : '',
    date: transfer?.date ?? todayISO(),
    note: transfer?.note ?? '',
  }));
  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  if (accounts.length < 2) {
    return <p className="py-6 text-center text-sm text-ink/60">Add at least two accounts (e.g. Cash and a Savings Vault) to move money between them.</p>;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    setBusy(true);
    const ok = await saveTransfer({ ...form, id: transfer?.id });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm('Delete this transfer? Both account balances will be restored.')) return;
    setBusy(true);
    if (await deleteTransaction(transfer)) onClose();
    else setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <AmountInput value={form.amount} onChange={set('amount')} autoFocus={!transfer} />
      <div className="space-y-2">
        <Field label="From">
          <AccountSelect value={form.fromAccountId} onChange={set('fromAccountId')} accounts={accounts} />
        </Field>
        <div className="flex justify-center text-ink/40" aria-hidden="true">
          <ArrowDown size={18} />
        </div>
        <Field label="To">
          <AccountSelect value={form.toAccountId} onChange={set('toAccountId')} accounts={accounts.filter((a) => a.id !== form.fromAccountId)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={form.date} max={todayISO()} onChange={(e) => set('date')(e.target.value)} required />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => set('note')(e.target.value)} placeholder="Optional" maxLength={80} />
        </Field>
      </div>
      <p className="text-xs text-ink/50">Moves money between your own accounts. Not counted as income or expense.</p>
      <div className="flex gap-3 pt-1">
        {transfer && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete transfer" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {transfer ? 'Save transfer' : 'Move money'}
        </Button>
      </div>
    </form>
  );
}

/** Moves money between accounts. `toSavings` pre-selects a savings vault as the destination. */
export default function TransferModal({ open, onClose, transfer, toSavings = false }) {
  return (
    <Modal open={open} onClose={onClose} title={transfer ? 'Edit transfer' : toSavings ? 'Move to savings' : 'Transfer between accounts'}>
      <FormBody transfer={transfer} toSavings={toSavings} onClose={onClose} />
    </Modal>
  );
}
