import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { Field, Input } from './FormField';
import { useSettings } from '../../context/SettingsContext';
import QuickLockSettings from '../security/QuickLockSettings';
import { FOREIGN_CURRENCIES } from '../../utils/constants';

function FormBody({ onClose }) {
  const { rates, updateSettings } = useSettings();
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(rates).map(([code, value]) => [code, String(value)])));

  const submit = (e) => {
    e.preventDefault();
    updateSettings({
      rates: Object.fromEntries(Object.entries(form).map(([code, value]) => [code, Number(value) > 0 ? Number(value) : rates[code]])),
    });
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {Object.keys(FOREIGN_CURRENCIES).map((code) => (
          <Field key={code} label={`${code} → PKR rate`}>
            <Input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              value={form[code]}
              onChange={(e) => setForm((prev) => ({ ...prev, [code]: e.target.value }))}
              required
            />
          </Field>
        ))}
      </div>
      <p className="-mt-3 text-xs text-ink/40">Used to convert foreign-currency subscriptions to PKR when you pay them.</p>

      <Button type="submit" size="lg" className="w-full">
        Save rates
      </Button>

      <QuickLockSettings onNavigate={onClose} />
    </form>
  );
}

export default function SettingsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <FormBody onClose={onClose} />
    </Modal>
  );
}
