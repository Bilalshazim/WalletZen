import { useState } from 'react';
import { CheckCircle2, CloudDownload, ExternalLink, Loader2, PencilLine, Trash2, Wallet } from 'lucide-react';
import Button from '../common/Button';
import IconCircle from '../common/IconCircle';
import SegmentedControl from '../common/SegmentedControl';
import { Field, Input, Select } from '../common/FormField';
import MeterOwnerCard from './MeterOwnerCard';
import StatusTag from './StatusTag';
import { useFinance } from '../../context/FinanceContext';
import { BILL_API_MODE, splitReference, validateIdentifier } from '../../services/billAggregatorApi';
import { billStatus } from '../../utils/analytics';
import { AREA_CODES, UTILITY_PROVIDERS } from '../../utils/constants';
import { formatCurrency, formatDate, formatDue, todayISO } from '../../utils/formatters';

const monthLabel = (billingMonth) => formatDate(`${billingMonth}-01`, { month: 'long', year: 'numeric' });
const AREA_OPTIONS = Object.entries(AREA_CODES).map(([value, label]) => ({ value, label: value, title: label }));

/** Copies the reference to the clipboard and opens the company's official bill page in a new tab. */
async function openOfficialBill(url, reference) {
  try {
    await navigator.clipboard.writeText(reference);
  } catch {
    // Clipboard can be blocked; the page still opens.
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function OfficialBillLink({ meta, reference, areaCode }) {
  const [opened, setOpened] = useState(false);
  if (!meta.officialBillUrl || !/^\d{14}$/.test(reference)) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => {
          openOfficialBill(meta.officialBillUrl, reference);
          setOpened(true);
        }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        <ExternalLink size={13} /> Open official {meta.label} bill
      </button>
      {opened && (
        <span className="text-[11px] text-ink/50">
          Reference copied — paste it there and choose <b>{areaCode}</b> ({AREA_CODES[areaCode]}).
        </span>
      )}
    </div>
  );
}

/** Lets the user replace demo figures with the exact amount and due date from their real bill. */
function ExactAmountForm({ bill, onSaved }) {
  const { saveBill } = useFinance();
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!(Number(amount) > 0) || !dueDate) return;
    setSaving(true);
    const ok = await saveBill({ ...bill, amount, dueDate, source: 'manual' });
    setSaving(false);
    if (ok) onSaved?.();
  };

  return (
    <div className="space-y-2 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3">
      <p className="text-xs font-medium text-ink/70">Enter the exact amount from your bill</p>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" inputMode="decimal" min="1" step="any" placeholder="Amount (Rs)" value={amount} onChange={(e) => setAmount(e.target.value)} className="py-2" aria-label="Exact amount" />
        <Input type="date" value={dueDate} max="9999-12-31" onChange={(e) => setDueDate(e.target.value)} className="py-2" aria-label="Exact due date" />
      </div>
      <Button size="sm" variant="secondary" className="w-full" loading={saving} disabled={!(Number(amount) > 0) || !dueDate} onClick={save}>
        Save exact amount
      </Button>
    </div>
  );
}

/** The fetched bill, with its status, demo notice and one-tap payment. */
function FetchedBill({ outcome, meta, savedBill, wallet, onPay, paying, onDone }) {
  const { result, alreadyPaid } = outcome;
  // After "Save exact amount", show the user's figures instead of the demo ones.
  const isDemo = (savedBill?.source ?? result.source) === 'demo';
  const amount = savedBill?.amount ?? result.amount;
  const dueDate = savedBill?.dueDate ?? result.dueDate;

  return (
    <div className="animate-sheet-up space-y-4 rounded-3xl border border-ink/10 bg-ink/5 p-4" aria-live="polite">
      <div className="flex items-center gap-3">
        <IconCircle icon={meta.icon} color="#C98500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{result.company}</p>
          <p className="text-xs text-ink/50">
            {meta.kind} · {monthLabel(result.billingMonth)} bill
            {result.identifier && ` · ${result.identifier}`}
          </p>
        </div>
        {isDemo && <StatusTag status="demo" />}
      </div>

      <MeterOwnerCard bill={savedBill} owner={result.owner} reference={result.identifier} />

      {alreadyPaid ? (
        <p className="flex items-center gap-2 text-sm text-ink/70">
          <CheckCircle2 size={16} className="text-accent" />
          No unpaid bill — the {monthLabel(result.billingMonth)} bill is already paid.
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-ink/50">{isDemo ? 'Sample amount (demo)' : 'Unpaid amount'}</p>
              <p className={`text-3xl font-extrabold tracking-tight tabular-nums ${isDemo ? 'text-ink/50 line-through decoration-sky-500/60' : 'text-ink'}`}>
                {formatCurrency(amount)}
              </p>
              {!isDemo && result.lateAmount && savedBill?.source !== 'manual' && (
                <p className="text-[11px] text-ink/45">After due date: {formatCurrency(result.lateAmount)}</p>
              )}
            </div>
            <div className="text-right">
              <StatusTag status={billStatus(dueDate)} />
              <p className="mt-1 text-xs text-ink/60">Due {formatDate(dueDate)}</p>
              <p className="text-[11px] text-ink/45">{formatDue(dueDate)}</p>
            </div>
          </div>

          {isDemo && (
            <div className="space-y-2">
              <p className="text-[11px] text-sky-700 dark:text-sky-300">
                This is sample data from the demo aggregator, <b>not your real bill</b>. For the exact figures, open the official bill and enter
                them below. Automatic real amounts need a live 1Bill / Kuickpay backend.
              </p>
              <OfficialBillLink meta={meta} reference={splitReference(result.identifier).digits} areaCode={splitReference(result.identifier).areaCode} />
              {savedBill && <ExactAmountForm bill={savedBill} />}
            </div>
          )}
          {!isDemo && savedBill && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-accent">
              <CheckCircle2 size={14} /> In Upcoming bills & subscriptions
            </p>
          )}
        </>
      )}

      {/* Stacked on phones so the long wallet name never overflows; side by side from sm up. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="secondary" onClick={onDone} className="sm:flex-none">
          Done
        </Button>
        {!alreadyPaid && savedBill && !isDemo && (
          <Button icon={Wallet} className="min-w-0 sm:flex-1" loading={paying} disabled={!wallet} onClick={onPay}>
            <span className="truncate">Pay & Deduct from {wallet?.name ?? 'wallet'}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Utility bill form: biller + Reference no. (with U/R) or Consumer ID, "Fetch Latest Bill", and a manual path. */
export default function UtilityBillFetcher({ bill, onClose }) {
  const { accounts, accountsById, bills, fetchLatestUtilityBill, markBillPaid, saveBill, deleteBill } = useFinance();
  const [form, setForm] = useState(() => {
    const provider = bill?.provider ?? 'LESCO';
    const ids = UTILITY_PROVIDERS[provider].ids;
    const idType = bill?.idType && ids[bill.idType] ? bill.idType : Object.keys(ids)[0];
    const stored = ids[idType]?.areaCode ? splitReference(bill?.consumerId) : { digits: bill?.consumerId ?? '', areaCode: 'U' };
    return {
      provider,
      idType,
      identifier: stored.digits,
      areaCode: stored.areaCode,
      accountId: bill?.accountId ?? accounts[0]?.id ?? '',
      title: bill?.title ?? '',
      amount: bill?.amount != null ? String(bill.amount) : '',
      dueDate: bill?.dueDate ?? todayISO(),
    };
  });
  const [fetching, setFetching] = useState(false);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [manual, setManual] = useState(Boolean(bill) && (!bill?.lastSyncedAt || bill?.source !== 'live'));

  const meta = UTILITY_PROVIDERS[form.provider];
  const idSpec = meta.ids[form.idType];
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const changeProvider = (e) => {
    const provider = e.target.value;
    const ids = UTILITY_PROVIDERS[provider].ids;
    setForm((prev) => ({ ...prev, provider, idType: ids[prev.idType] ? prev.idType : Object.keys(ids)[0] }));
    setOutcome(null);
    setError(null);
  };

  // A typed U/R suffix ("…406U") moves into the toggle so both inputs always agree.
  const changeIdentifier = (e) => {
    const value = e.target.value;
    const suffix = idSpec.areaCode && /^[\d\s-]*\d[\s-]*([uUrR])$/.exec(value);
    setForm((prev) => (suffix ? { ...prev, identifier: value.slice(0, -1).trimEnd(), areaCode: suffix[1].toUpperCase() } : { ...prev, identifier: value }));
  };

  const fetchBill = async () => {
    setError(null);
    setOutcome(null);
    if (!form.accountId) return setError('Choose the wallet you will pay from.');
    setFetching(true);
    try {
      setOutcome(
        await fetchLatestUtilityBill({
          provider: form.provider,
          idType: form.idType,
          identifier: form.identifier,
          areaCode: form.areaCode,
          accountId: form.accountId,
          title: form.title,
          billId: bill?.id,
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const savedBill = outcome?.billId ? bills.find((b) => b.id === outcome.billId) : null;

  const pay = async () => {
    setPaying(true);
    const ok = await markBillPaid(savedBill);
    setPaying(false);
    if (ok) onClose();
  };

  const saveManually = async (e) => {
    e.preventDefault();
    setError(null);
    if (!(Number(form.amount) > 0)) return setError('Enter the bill amount.');
    let consumerId = form.identifier.trim();
    if (consumerId) {
      try {
        consumerId = validateIdentifier(form.provider, form.idType, consumerId, form.areaCode);
      } catch (err) {
        return setError(err.message);
      }
    }
    setSaving(true);
    const ok = await saveBill({
      id: bill?.id,
      kind: 'utility',
      title: form.title || `${meta.label} bill`,
      amount: form.amount,
      currency: 'PKR',
      cycle: 'monthly',
      category: 'utility',
      dueDate: form.dueDate,
      accountId: form.accountId,
      provider: form.provider,
      idType: form.idType,
      consumerId,
      source: 'manual',
    });
    setSaving(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${bill.title}" from the planner?`)) return;
    if (await deleteBill(bill.id)) onClose();
  };

  const idOptions = Object.entries(meta.ids).map(([value, spec]) => ({ value, label: spec.label }));
  const referenceDigits = form.identifier.replace(/[\s-]/g, '');

  return (
    <form onSubmit={saveManually} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Biller">
          <Select value={form.provider} onChange={changeProvider}>
            {Object.entries(UTILITY_PROVIDERS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label} · {p.kind}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pay from">
          <Select value={form.accountId} onChange={set('accountId')} required>
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

      {idOptions.length > 1 && (
        <SegmentedControl options={idOptions} value={form.idType} onChange={(idType) => setForm((prev) => ({ ...prev, idType }))} size="sm" />
      )}

      <Field label={`${idSpec.label} · ${idSpec.hint}`}>
        <div className="flex gap-2">
          <Input
            value={form.identifier}
            onChange={changeIdentifier}
            inputMode={form.provider === 'INTERNET' ? 'text' : idSpec.areaCode ? 'text' : 'numeric'}
            placeholder={idSpec.areaCode ? '14-digit reference' : idSpec.hint}
            maxLength={24}
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 tabular-nums tracking-wide"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                fetchBill();
              }
            }}
          />
          {idSpec.areaCode && (
            <div role="radiogroup" aria-label="Area code" className="flex shrink-0 rounded-2xl border border-ink/10 bg-ink/5 p-1">
              {AREA_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.areaCode === option.value}
                  title={option.title}
                  onClick={() => setForm((prev) => ({ ...prev, areaCode: option.value }))}
                  className={`w-9 rounded-xl text-sm font-bold transition ${
                    form.areaCode === option.value ? 'bg-gradient-to-r from-zen-lime to-zen-emerald text-zen-950' : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <Button icon={fetching ? undefined : CloudDownload} loading={fetching} onClick={fetchBill} disabled={!form.identifier.trim()} className="shrink-0">
            <span className="hidden sm:inline">Fetch Latest Bill</span>
            <span className="sm:hidden">Fetch</span>
          </Button>
        </div>
        {idSpec.areaCode && (
          <span className="mt-1 block text-xs text-ink/40">
            U = Urban, R = Rural — printed after the reference no. on your bill. You can also type it, e.g. …406U.
          </span>
        )}
      </Field>

      {idSpec.areaCode && !outcome && <OfficialBillLink meta={meta} reference={referenceDigits} areaCode={form.areaCode} />}

      <Field label="Label (optional)">
        <Input value={form.title} onChange={set('title')} placeholder={`${meta.label} — Home`} maxLength={40} />
      </Field>

      {fetching && (
        <div className="flex items-center gap-3 rounded-3xl border border-ink/10 bg-ink/5 p-4 text-sm text-ink/70" role="status">
          <Loader2 size={18} className="animate-spin text-accent" />
          Fetching the latest {meta.label} bill{BILL_API_MODE === 'demo' ? ' (demo aggregator)' : ' from 1Bill / Kuickpay'}…
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      {outcome && (
        <FetchedBill
          outcome={outcome}
          meta={meta}
          savedBill={savedBill}
          wallet={accountsById[form.accountId]}
          onPay={pay}
          paying={paying}
          onDone={onClose}
        />
      )}

      {bill && !outcome && <MeterOwnerCard bill={bills.find((b) => b.id === bill.id) ?? bill} reference={bill.consumerId} />}

      {!outcome && (
        <div className="border-t border-ink/10 pt-3">
          {manual ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount (Rs)">
                  <Input type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={set('amount')} />
                </Field>
                <Field label="Due date">
                  <Input type="date" value={form.dueDate} max="9999-12-31" onChange={set('dueDate')} />
                </Field>
              </div>
              <div className="flex gap-2">
                {bill && <Button variant="danger" size="icon" icon={Trash2} onClick={remove} aria-label="Delete bill" />}
                <Button type="submit" variant="secondary" className="flex-1" loading={saving}>
                  Save exact amount
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setManual(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink/55 hover:text-ink">
              <PencilLine size={13} /> Enter exact amount manually instead
            </button>
          )}
        </div>
      )}
    </form>
  );
}
