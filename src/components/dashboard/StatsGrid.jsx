import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Hourglass } from 'lucide-react';
import Panel from '../common/Panel';
import IconCircle from '../common/IconCircle';
import SegmentedControl from '../common/SegmentedControl';
import { Input } from '../common/FormField';
import { useFinance } from '../../context/FinanceContext';
import { periodRange, PROJECTION_DAYS, rangeSummary } from '../../utils/analytics';
import { cx, formatCurrency, formatDate, todayISO } from '../../utils/formatters';

const PERIODS = [
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom' },
];

const STORAGE_KEY = 'walletzen:stats-period';

const readPeriod = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.period) return saved;
  } catch {
    // fall through to default
  }
  return { period: 'month', custom: { from: `${todayISO().slice(0, 8)}01`, to: todayISO() } };
};

function StatTile({ label, value, icon, color, hint, valueClass, className }) {
  return (
    <Panel className={cx('flex flex-col gap-3 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink/55">{label}</p>
        <IconCircle icon={icon} color={color} size={15} className="p-2" />
      </div>
      <div className="min-w-0">
        <p className={cx('truncate font-display text-xl font-semibold tracking-tight tabular-nums', valueClass ?? 'text-ink')}>{value}</p>
        {hint && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink/45">{hint}</p>}
      </div>
    </Panel>
  );
}

/**
 * Key metrics under the Net Worth / Savings cards. Everything derives from live FinanceContext state, so new entries,
 * screenshot imports and bill payments are reflected on the next render.
 */
export default function StatsGrid() {
  const { transactions, projected } = useFinance();
  const [{ period, custom }, setState] = useState(readPeriod);

  const update = (patch) =>
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // per-device convenience only
      }
      return next;
    });

  const range = periodRange(period, custom);

  const stats = useMemo(() => {
    const today = todayISO();
    const todays = rangeSummary(transactions, today, today);
    const inPeriod = rangeSummary(transactions, range.from, range.to);
    const todayExpenses = transactions.filter((t) => t.date === today && t.type === 'expense' && t.status !== 'pending').length;
    return { todays, todayExpenses, inPeriod };
  }, [transactions, range.from, range.to]);

  const periodLabel =
    period === 'month'
      ? formatDate(range.to, { month: 'long', year: 'numeric' })
      : `${formatDate(range.from, { day: 'numeric', month: 'short' })} – ${formatDate(range.to, { day: 'numeric', month: 'short' })}`;
  const net = stats.inPeriod.income - stats.inPeriod.expense;

  return (
    <section aria-label="Summary" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SegmentedControl options={PERIODS} value={period} onChange={(value) => update({ period: value })} size="sm" className="sm:w-80" />
        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Input
              type="date"
              value={custom.from}
              max={todayISO()}
              onChange={(e) => update({ custom: { ...custom, from: e.target.value } })}
              className="py-2"
              aria-label="From date"
            />
            <Input
              type="date"
              value={custom.to}
              max={todayISO()}
              onChange={(e) => update({ custom: { ...custom, to: e.target.value } })}
              className="py-2"
              aria-label="To date"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Spent today"
          value={formatCurrency(stats.todays.expense)}
          icon={CalendarDays}
          color="#D95926"
          hint={stats.todayExpenses ? `${stats.todayExpenses} expense${stats.todayExpenses === 1 ? '' : 's'} today` : 'Nothing spent yet'}
        />
        <StatTile
          label="Income received"
          value={formatCurrency(stats.inPeriod.income)}
          icon={ArrowDownLeft}
          color="#199E70"
          valueClass="text-accent"
          hint={periodLabel}
        />
        <StatTile
          label="Expenses spent"
          value={formatCurrency(stats.inPeriod.expense)}
          icon={ArrowUpRight}
          color="#D95926"
          hint={periodLabel}
        />
        <StatTile
          label="Projected income"
          value={formatCurrency(projected.income)}
          icon={Hourglass}
          color="#C98500"
          valueClass={projected.income > 0 ? 'text-ink' : 'text-ink/40'}
          hint={
            projected.incomeCount
              ? `${projected.incomeCount} pending · not in balance yet`
              : `Nothing expected · period net ${formatCurrency(net, { sign: true })}`
          }
        />
      </div>
    </section>
  );
}
