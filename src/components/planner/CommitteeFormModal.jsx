import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Field, Input, Select } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, todayISO } from '../../utils/formatters';

function FormBody({ committee, onClose }) {
  const { accounts, saveCommittee, deleteCommittee } = useFinance();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    name: committee?.name ?? '',
    contribution: committee ? String(committee.contribution) : '',
    members: committee ? String(committee.members) : '10',
    payoutMonth: committee ? String(committee.payoutMonth) : '1',
    startDate: committee?.startDate ?? todayISO(),
    accountId: committee?.accountId ?? accounts[0]?.id ?? '',
  }));

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const members = Math.max(Number(form.members) || 0, 0);
  const pot = (Number(form.contribution) || 0) * members;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await saveCommittee({ ...form, id: committee?.id });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${committee.name}"? Logged installments stay in your history.`)) return;
    setBusy(true);
    if (await deleteCommittee(committee.id)) onClose();
    else setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Commattie name">
        <Input value={form.name} onChange={set('name')} placeholder="e.g. Office Commattie" maxLength={40} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly installment">
          <Input type="number" inputMode="decimal" min="1" step="any" value={form.contribution} onChange={set('contribution')} required />
        </Field>
        <Field label="Members / months">
          <Input
            type="number"
            inputMode="numeric"
            min={Math.max(2, committee?.paidCount ?? 0)}
            max="60"
            value={form.members}
            onChange={set('members')}
            required
          />
        </Field>
        <Field label="Your payout month">
          <Input type="number" inputMode="numeric" min="1" max={members || 1} value={form.payoutMonth} onChange={set('payoutMonth')} required />
        </Field>
        <Field label="First installment">
          <Input type="date" value={form.startDate} max="9999-12-31" onChange={set('startDate')} required />
        </Field>
      </div>

      <Field label="Linked account">
        <Select value={form.accountId ?? ''} onChange={set('accountId')} required>
          <option value="" disabled>
            Select account
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      <p className="rounded-2xl bg-zen-lime/10 px-4 py-3 text-sm text-ink/80">
        Total payout: <span className="font-semibold text-accent">{formatCurrency(pot)}</span>
      </p>

      <div className="flex gap-3 pt-1">
        {committee && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {committee ? 'Save Commattie' : 'Start tracking'}
        </Button>
      </div>
    </form>
  );
}

export default function CommitteeFormModal({ open, onClose, committee }) {
  return (
    <Modal open={open} onClose={onClose} title={committee ? 'Edit Commattie' : 'New Commattie'}>
      <FormBody committee={committee} onClose={onClose} />
    </Modal>
  );
}
