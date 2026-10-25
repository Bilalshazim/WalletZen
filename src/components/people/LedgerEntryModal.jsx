import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { AmountInput, Field, Input, Select } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES, LEDGER_KINDS } from '../../utils/constants';
import { cx, formatCurrency, todayISO } from '../../utils/formatters';

function FormBody({ entry, contactId, defaultKind, defaultAmount, onClose }) {
  const { accounts, contacts, saveLedgerEntry, deleteLedgerEntry } = useFinance();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    contactId: entry?.contactId ?? contactId ?? contacts[0]?.id ?? '',
    kind: entry?.kind ?? defaultKind,
    amount: entry ? String(entry.amount) : defaultAmount ? String(defaultAmount) : '',
    // Repayments usually move cash, so suggest an account; a new debt is just recorded unless one is chosen.
    accountId: entry
      ? entry.accountId ?? ''
      : ['collected', 'repaid'].includes(defaultKind)
        ? accounts.find((a) => a.type !== 'savings')?.id ?? ''
        : '',
    date: entry?.date ?? todayISO(),
    note: entry?.note ?? '',
  }));
  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const kind = LEDGER_KINDS[form.kind];

  if (contacts.length === 0) {
    return <p className="py-6 text-center text-sm text-ink/60">Add a contact first. Every loan is tracked against a person.</p>;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    setBusy(true);
    const ok = await saveLedgerEntry({ ...form, id: entry?.id });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm('Delete this entry? The linked account balance will be restored.')) return;
    setBusy(true);
    if (await deleteLedgerEntry(entry)) onClose();
    else setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="What happened" className="grid grid-cols-2 gap-2">
        {Object.entries(LEDGER_KINDS).map(([id, meta]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={form.kind === id}
            onClick={() => set('kind')(id)}
            className={cx(
              'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition',
              form.kind === id ? 'border-zen-lime/60 bg-zen-lime/10 text-ink' : 'border-ink/10 bg-ink/5 text-ink/70 hover:bg-ink/10',
            )}
          >
            {meta.label}
          </button>
        ))}
      </div>

      <AmountInput value={form.amount} onChange={set('amount')} autoFocus={!entry} />

      <Field label="Contact">
        <Select value={form.contactId} onChange={(e) => set('contactId')(e.target.value)} required>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={kind.cash < 0 ? 'Paid from' : 'Received into'}
        hint={form.accountId ? 'This account balance moves too.' : 'Only the ledger changes. No account balance moves.'}
      >
        <Select value={form.accountId} onChange={(e) => set('accountId')(e.target.value)}>
          <option value="">Not linked to an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {ACCOUNT_TYPES[a.type]?.label} · {formatCurrency(a.balance)}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input type="date" value={form.date} max={todayISO()} onChange={(e) => set('date')(e.target.value)} required />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => set('note')(e.target.value)} placeholder="Optional" maxLength={80} />
        </Field>
      </div>

      <p className="text-xs text-ink/50">Debts are tracked separately and never count as income or expenses.</p>

      <div className="flex gap-3 pt-1">
        {entry && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete entry" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {entry ? 'Save entry' : `Save: ${kind.label.toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}

/** Records a loan given/taken or a repayment against a contact. Pass `entry` to edit. */
export default function LedgerEntryModal({ open, onClose, entry, contactId, defaultKind = 'lent', defaultAmount }) {
  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Edit entry' : LEDGER_KINDS[defaultKind]?.label ?? 'Record entry'}>
      <FormBody entry={entry} contactId={contactId} defaultKind={defaultKind} defaultAmount={defaultAmount} onClose={onClose} />
    </Modal>
  );
}
