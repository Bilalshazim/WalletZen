import { useMemo, useState } from 'react';
import { History, Plus, PlugZap, RefreshCw } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import SegmentedControl from '../common/SegmentedControl';
import BillFormModal from './BillFormModal';
import BrandIcon from './BrandIcon';
import StatusTag from './StatusTag';
import UpcomingExpenses from './UpcomingExpenses';
import { useFinance } from '../../context/FinanceContext';
import { useSettings } from '../../context/SettingsContext';
import { BILL_API_MODE } from '../../services/billAggregatorApi';
import { billAmountPKR, billCycle } from '../../utils/analytics';
import { formatCurrency, formatDate, formatMoney } from '../../utils/formatters';

const VIEWS = [
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'utility', label: 'Utilities' },
  { value: 'bill', label: 'Other' },
  { value: 'paid', label: 'Paid' },
];

const kindOf = (bill) => bill.kind ?? 'bill';

function Stat({ label, value, tone = 'text-ink' }) {
  return (
    <div className="rounded-2xl bg-ink/5 p-3">
      <p className="text-[11px] text-ink/50">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function PaidList({ bills, accountsById }) {
  if (bills.length === 0) return <EmptyState icon={History} title="Nothing paid yet" message="Items you pay will show up here." />;
  return (
    <ul className="-mx-2 divide-y divide-ink/5">
      {bills.map((bill) => (
        <li key={bill.id} className="flex items-center gap-3 px-2 py-2.5">
          <BrandIcon bill={bill} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-ink">{bill.title}</p>
              <StatusTag status="paid" />
            </div>
            <p className="truncate text-xs text-ink/45">
              Paid {formatDate(bill.paidOn)} · {accountsById[bill.accountId]?.name ?? 'Deleted wallet'}
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-ink/70">{formatMoney(bill.amount, bill.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Unified manager for digital subscriptions, auto-fetched utility bills and other bills. */
export default function SubscriptionsPlanner() {
  const { bills, accountsById, syncUtilityBills } = useFinance();
  const { rates } = useSettings();
  const [view, setView] = useState('subscription');
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const stats = useMemo(() => {
    // Recurring cost of active subscriptions, normalised to per month (yearly ÷ 12).
    const latestPerSubscription = bills.filter((b) => kindOf(b) === 'subscription' && b.status === 'pending');
    const monthly = latestPerSubscription.reduce((sum, b) => {
      const pkr = billAmountPKR(b, rates) ?? 0;
      const cycle = billCycle(b);
      return sum + (cycle === 'yearly' ? pkr / 12 : cycle === 'monthly' ? pkr : 0);
    }, 0);
    const utilitiesDue = bills
      .filter((b) => kindOf(b) === 'utility' && b.status === 'pending')
      .reduce((sum, b) => sum + (b.amount ?? 0), 0);
    return { monthly, count: latestPerSubscription.length, utilitiesDue };
  }, [bills, rates]);

  const paid = useMemo(
    () => bills.filter((b) => b.status === 'paid').sort((a, b) => (b.paidOn ?? '').localeCompare(a.paidOn ?? '')).slice(0, 25),
    [bills],
  );

  const checkNow = async () => {
    setSyncing(true);
    await syncUtilityBills({ force: true });
    setSyncing(false);
  };

  return (
    <Card
      title="Bills & subscriptions"
      subtitle="Digital subscriptions, utilities and other recurring bills"
      action={
        <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
          Add
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Subscriptions" value={stats.count} />
        <Stat label="Per month" value={formatCurrency(Math.round(stats.monthly))} tone="text-accent" />
        <Stat label="Utilities due" value={formatCurrency(stats.utilitiesDue)} />
      </div>

      <SegmentedControl options={VIEWS} value={view} onChange={setView} size="sm" className="mb-3" />

      {view === 'utility' && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-ink/5 p-3 text-xs text-ink/60">
          <PlugZap size={16} className={BILL_API_MODE === 'live' ? 'text-accent' : 'text-sky-600 dark:text-sky-300'} />
          <p className="flex-1">
            {BILL_API_MODE === 'live'
              ? 'Live 1Bill / Kuickpay: tap Add → Utility bill → Fetch Latest Bill. Pending bills refresh every 12 hours.'
              : 'Demo aggregator: fetched bills are sample data (tagged Demo). Connect a live 1Bill / Kuickpay backend for real amounts — see README.'}
          </p>
          {bills.some((b) => b.kind === 'utility' && b.status === 'pending') && (
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={syncing} onClick={checkNow}>
              Refresh
            </Button>
          )}
        </div>
      )}

      {view === 'paid' ? (
        <PaidList bills={paid} accountsById={accountsById} />
      ) : (
        <UpcomingExpenses
          bare
          filter={(item) => item.kind === 'bill' && kindOf(item.source) === view}
          emptyMessage={
            view === 'subscription'
              ? 'Add Netflix, Spotify, ChatGPT, Claude, your gym… and never miss a renewal.'
              : view === 'utility'
                ? 'Add LESCO, FESCO, SNGPL, PTCL or internet with your reference number.'
                : 'Nothing pending.'
          }
        />
      )}

      <BillFormModal open={creating} defaultKind={view === 'paid' ? 'subscription' : view} onClose={() => setCreating(false)} />
    </Card>
  );
}
