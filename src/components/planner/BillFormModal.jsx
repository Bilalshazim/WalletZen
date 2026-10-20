import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import SegmentedControl from '../common/SegmentedControl';
import { AmountInput, Field, Input, Select } from '../common/FormField';
import CategoryBadge from '../transactions/CategoryBadge';
import BrandIcon from './BrandIcon';
import { useFinance } from '../../context/FinanceContext';
import { useSettings } from '../../context/SettingsContext';
import UtilityBillFetcher from './UtilityBillFetcher';
import { billCycle } from '../../utils/analytics';
import {
  BILLING_CYCLES,
  CURRENCIES,
  currencySymbol,
  DEFAULT_SUBSCRIPTION_ICON,
  EXPENSE_CATEGORIES,
  SUBSCRIPTION_ICONS,
  SUBSCRIPTION_PRESETS,
} from '../../utils/constants';
import { cx, formatCurrency, todayISO } from '../../utils/formatters';

const KIND_OPTIONS = [
  { value: 'subscription', label: 'Subscription' },
  { value: 'utility', label: 'Utility bill' },
  { value: 'bill', label: 'Other bill' },
];
const cycleOptions = (kinds) => kinds.map((value) => ({ value, label: BILLING_CYCLES[value].label }));
const CURRENCY_OPTIONS = CURRENCIES.map((value) => ({ value, label: value }));
const DEFAULT_CATEGORY = { subscription: 'subscriptions', utility: 'utility', bill: 'home' };

function FormBody({ bill, defaultKind, onClose }) {
  const { accounts, saveBill, deleteBill } = useFinance();
  const { rates } = useSettings();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => {
    const kind = bill?.kind ?? (bill ? 'bill' : defaultKind);
    return {
      kind,
      title: bill?.title ?? '',
      amount: bill?.amount != null ? String(bill.amount) : '',
      currency: bill?.currency ?? 'PKR',
      cycle: bill ? billCycle(bill) : 'monthly',
      category: bill?.category ?? DEFAULT_CATEGORY[kind],
      dueDate: bill?.dueDate ?? todayISO(),
      accountId: bill?.accountId ?? accounts[0]?.id ?? '',
      brandDomain: bill?.brandDomain ?? '',
      icon: bill?.icon ?? DEFAULT_SUBSCRIPTION_ICON,
    };
  });

  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const setFromEvent = (field) => (e) => set(field)(e.target.value);

  const switchKind = (kind) =>
    setForm((prev) => ({ ...prev, kind, category: DEFAULT_CATEGORY[kind], currency: kind === 'subscription' ? prev.currency : 'PKR' }));

  const applyPreset = (preset) =>
    setForm((prev) => ({
      ...prev,
      title: preset.name,
      brandDomain: preset.domain,
      icon: preset.icon,
      currency: preset.currency,
    }));

  const isUtility = form.kind === 'utility';
  const isSubscription = form.kind === 'subscription';

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return;
    setBusy(true);
    const ok = await saveBill({ ...form, id: bill?.id });
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${bill.title}" from the planner?`)) return;
    setBusy(true);
    if (await deleteBill(bill.id)) onClose();
    else setBusy(false);
  };

  const kindSwitch = !bill && <SegmentedControl options={KIND_OPTIONS} value={form.kind} onChange={switchKind} size="sm" />;

  // Utility bills have their own fetch-first flow.
  if (isUtility) {
    return (
      <div className="space-y-5">
        {kindSwitch}
        <UtilityBillFetcher bill={bill} onClose={onClose} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {kindSwitch}

      {isSubscription && !bill && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {SUBSCRIPTION_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className={cx(
                'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
                form.title === preset.name ? 'border-zen-lime/60 bg-zen-lime/10 text-ink' : 'border-ink/10 bg-ink/5 text-ink/70 hover:bg-ink/10',
              )}
            >
              <BrandIcon small bill={{ kind: 'subscription', brandDomain: preset.domain, icon: preset.icon, category: 'subscriptions' }} />
              {preset.name}
            </button>
          ))}
        </div>
      )}

      {isSubscription && (
        <SegmentedControl options={CURRENCY_OPTIONS} value={form.currency} onChange={set('currency')} size="sm" className="mx-auto max-w-[15rem]" />
      )}
      <div>
        <AmountInput value={form.amount} onChange={set('amount')} autoFocus={!bill} prefix={currencySymbol(form.currency)} />
        {form.currency !== 'PKR' && Number(form.amount) > 0 && (
          <p className="-mt-1 text-center text-xs text-ink/50">
            ≈ {formatCurrency(Number(form.amount) * rates[form.currency])} at {rates[form.currency]} PKR/{form.currency}
          </p>
        )}
      </div>

      <Field label="Name">
        <Input
          value={form.title}
          onChange={setFromEvent('title')}
          placeholder={isSubscription ? 'e.g. Netflix' : 'e.g. School fee'}
          maxLength={40}
          required
        />
      </Field>

      {isSubscription && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Website (for logo)">
            <Input value={form.brandDomain} onChange={setFromEvent('brandDomain')} placeholder="netflix.com" maxLength={60} />
          </Field>
          <Field label="Fallback icon">
            <Select value={form.icon} onChange={setFromEvent('icon')}>
              {Object.keys(SUBSCRIPTION_ICONS).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {form.kind === 'bill' && (
        <div className="flex flex-wrap gap-2">
          {Object.keys(EXPENSE_CATEGORIES).map((id) => (
            <CategoryBadge key={id} category={id} selected={form.category === id} onClick={() => set('category')(id)} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={isSubscription ? 'Renewal date' : 'Due date'}>
          <Input type="date" value={form.dueDate} max="9999-12-31" onChange={setFromEvent('dueDate')} required />
        </Field>
        <Field label="Pay from">
          <Select value={form.accountId ?? ''} onChange={setFromEvent('accountId')} required>
            <option value="" disabled>
              Select wallet
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <SegmentedControl
        options={cycleOptions(['monthly', 'yearly', 'once'])}
        value={form.cycle}
        onChange={set('cycle')}
        size="sm"
      />

      <div className="flex gap-3 pt-1">
        {bill && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete" disabled={busy} />}
        <Button type="submit" size="lg" className="flex-1" loading={busy}>
          {bill ? 'Save changes' : isSubscription ? 'Add subscription' : 'Add bill'}
        </Button>
      </div>
    </form>
  );
}

const TITLES = { subscription: 'subscription', utility: 'utility bill', bill: 'bill' };

/** Add/edit form for subscriptions, auto-fetched utility bills and other bills. */
export default function BillFormModal({ open, onClose, bill, defaultKind = 'subscription' }) {
  const kind = bill?.kind ?? (bill ? 'bill' : defaultKind);
  return (
    <Modal open={open} onClose={onClose} title={bill ? `Edit ${TITLES[kind]}` : 'Add to planner'}>
      <FormBody bill={bill} defaultKind={defaultKind} onClose={onClose} />
    </Modal>
  );
}
