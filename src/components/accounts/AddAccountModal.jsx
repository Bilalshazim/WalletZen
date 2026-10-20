import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import AccountIcon from '../common/AccountIcon';
import IconCircle from '../common/IconCircle';
import { Field, Input, Select } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES, WALLET_PROVIDERS } from '../../utils/constants';
import { cx } from '../../utils/formatters';

function FormBody({ account, defaultType, onClose }) {
  const { saveAccount, deleteAccount, transactions } = useFinance();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    name: account?.name ?? '',
    type: account?.type ?? defaultType,
    provider: account?.provider ?? WALLET_PROVIDERS[0],
    balance: account ? String(account.balance) : '',
  }));

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const provider = form.type === 'wallet' ? form.provider : null;
    const ok = await saveAccount({ ...form, provider, id: account?.id });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    const count = transactions.filter((t) => t.accountId === account.id).length;
    const warning = count ? ` Its ${count} transaction${count === 1 ? '' : 's'} will be deleted too.` : '';
    if (!window.confirm(`Delete "${account.name}"?${warning}`)) return;
    setBusy(true);
    if (await deleteAccount(account.id)) onClose();
    else setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(ACCOUNT_TYPES).map(([id, meta]) => (
          <button
            key={id}
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, type: id }))}
            aria-pressed={form.type === id}
            className={cx(
              'flex items-center gap-2.5 rounded-2xl border p-3 text-left text-sm transition',
              form.type === id ? 'border-zen-lime/60 bg-zen-lime/10 text-ink' : 'border-ink/10 bg-ink/5 text-ink/70 hover:bg-ink/10',
            )}
          >
            <IconCircle icon={meta.icon} color={meta.color} size={16} className="p-2" />
            {meta.label}
          </button>
        ))}
      </div>

      {form.type === 'wallet' && (
        <Field label="Provider">
          <Select value={form.provider} onChange={set('provider')}>
            {WALLET_PROVIDERS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Account name">
        <div className="flex items-center gap-3">
          {/* Live preview of the auto-detected bank / wallet logo. */}
          <AccountIcon account={{ type: form.type, name: form.name, provider: form.type === 'wallet' ? form.provider : null }} />
          <Input value={form.name} onChange={set('name')} placeholder="e.g. Meezan Current, HBL Savings, Pocket Cash" maxLength={40} required />
        </div>
      </Field>

      <Field
        label={account ? 'Current balance' : 'Opening balance'}
        hint={account ? 'Changing this records a manual balance correction.' : undefined}
      >
        <Input type="number" inputMode="decimal" step="any" value={form.balance} onChange={set('balance')} placeholder="0" required />
      </Field>

      <div className="flex gap-3 pt-1">
        {account && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete account" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {account ? 'Save account' : 'Add account'}
        </Button>
      </div>
    </form>
  );
}

export default function AddAccountModal({ open, onClose, account, defaultType = 'cash' }) {
  return (
    <Modal open={open} onClose={onClose} title={account ? 'Edit account' : 'Link new account'}>
      <FormBody account={account} defaultType={defaultType} onClose={onClose} />
    </Modal>
  );
}
