import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SegmentedControl from '../common/SegmentedControl';
import { AmountInput, Field, Input, Select } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES, DEBT_DIRECTIONS } from '../../utils/constants';
import { formatCurrency, todayISO } from '../../utils/formatters';

const NEW = '__new__';
const DIRECTION_OPTIONS = [
  { value: 'receivable', label: 'They owe me' },
  { value: 'payable', label: 'I owe them' },
];

function FormBody({ defaultDirection, contactId, onClose }) {
  const { accounts, contacts, saveDebt } = useFinance();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    direction: defaultDirection,
    contactId: contactId ?? (contacts.length ? contacts[0].id : NEW),
    name: '',
    phone: '',
    amount: '',
    // Recording an existing debt moves no money; an account is only linked when cash changes hands now.
    accountId: '',
    date: todayISO(),
    note: '',
  }));
  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const isReceivable = form.direction === 'receivable';
  const isNew = form.contactId === NEW;

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    setBusy(true);
    const ok = await saveDebt({
      direction: form.direction,
      contactId: isNew ? null : form.contactId,
      newContact: isNew ? { name: form.name, phone: form.phone } : null,
      amount: form.amount,
      accountId: form.accountId,
      date: form.date,
      note: form.note,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <SegmentedControl
        options={DIRECTION_OPTIONS.map((o) => (o.value === 'payable' ? { ...o, activeClass: 'bg-orange-500/90 text-white shadow-md' } : o))}
        value={form.direction}
        onChange={set('direction')}
      />
      <AmountInput value={form.amount} onChange={set('amount')} autoFocus />

      <Field label={DEBT_DIRECTIONS[form.direction].question}>
        <Select value={form.contactId} onChange={(e) => set('contactId')(e.target.value)} required>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW}>+ New person…</option>
        </Select>
      </Field>
      {isNew && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Ali Raza" maxLength={60} required />
          </Field>
          <Field label="Phone">
            <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="Optional" maxLength={20} />
          </Field>
        </div>
      )}

      <Field
        label={isReceivable ? 'Did you hand over money now?' : 'Did you receive money now?'}
        hint={
          form.accountId
            ? `${isReceivable ? 'Taken from' : 'Added to'} this account's balance.`
            : 'No — just record what is owed. No account balance changes.'
        }
      >
        <Select value={form.accountId} onChange={(e) => set('accountId')(e.target.value)}>
          <option value="">No, just record it</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {isReceivable ? 'Yes, paid from' : 'Yes, received into'} {a.name} · {ACCOUNT_TYPES[a.type]?.label} · {formatCurrency(a.balance)}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={form.date} max={todayISO()} onChange={(e) => set('date')(e.target.value)} required />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => set('note')(e.target.value)} placeholder="e.g. for bike repair" maxLength={80} />
        </Field>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {isReceivable ? 'Add receivable' : 'Add payable'}
      </Button>
    </form>
  );
}

/** Quick entry: "X owes me Rs …" (receivable) or "I owe X Rs …" (payable). */
export default function DebtEntryModal({ open, onClose, direction = 'receivable', contactId }) {
  return (
    <Modal open={open} onClose={onClose} title={DEBT_DIRECTIONS[direction].title}>
      <FormBody defaultDirection={direction} contactId={contactId} onClose={onClose} />
    </Modal>
  );
}
