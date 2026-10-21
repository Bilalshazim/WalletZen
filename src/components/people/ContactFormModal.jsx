import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { Field, Input } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { CONTACT_CATEGORIES } from '../../utils/constants';
import { cx } from '../../utils/formatters';

function FormBody({ contact, defaultCategory, onClose, onSaved }) {
  const { saveContact, deleteContact, ledger } = useFinance();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    note: contact?.note ?? '',
    category: contact?.category ?? defaultCategory,
  }));
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await saveContact({ ...form, id: contact?.id });
    setBusy(false);
    if (ok) (onSaved ?? onClose)();
  };

  const remove = async () => {
    const entries = ledger.filter((entry) => entry.contactId === contact.id).length;
    const warning = entries ? ` Their ${entries} loan entr${entries === 1 ? 'y' : 'ies'} will be deleted too (account balances stay as they are).` : '';
    if (!window.confirm(`Delete ${contact.name}?${warning}`)) return;
    setBusy(true);
    if (await deleteContact(contact.id)) onClose();
    else setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="Category" className="grid grid-cols-3 gap-2">
        {Object.entries(CONTACT_CATEGORIES).map(([id, meta]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={form.category === id}
            onClick={() => setForm((prev) => ({ ...prev, category: id }))}
            className={cx(
              'rounded-2xl border p-2.5 text-left transition',
              form.category === id ? 'border-zen-lime/60 bg-zen-lime/10' : 'border-ink/10 bg-ink/5 hover:bg-ink/10',
            )}
          >
            <span className="block text-sm font-medium" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="block text-[10px] leading-tight text-ink/50">{meta.hint}</span>
          </button>
        ))}
      </div>

      <Field label="Name">
        <Input value={form.name} onChange={set('name')} placeholder="e.g. Ali Raza, Bilal (landlord)" maxLength={60} required autoFocus={!contact} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <Input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="03xx xxxxxxx" maxLength={20} />
        </Field>
        <Field label="Email">
          <Input type="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="Optional" maxLength={80} />
        </Field>
      </div>
      <Field label="Note">
        <Input value={form.note} onChange={set('note')} placeholder="Optional — bank details, relation…" maxLength={120} />
      </Field>

      <div className="flex gap-3 pt-1">
        {contact && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete contact" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {contact ? 'Save contact' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}

export default function ContactFormModal({ open, onClose, onSaved, contact, defaultCategory = 'payee' }) {
  return (
    <Modal open={open} onClose={onClose} title={contact ? 'Edit contact' : 'New contact'}>
      <FormBody contact={contact} defaultCategory={defaultCategory} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}
