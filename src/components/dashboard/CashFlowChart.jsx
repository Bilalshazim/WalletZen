import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../common/Card';
import SegmentedControl from '../common/SegmentedControl';
import { useFinance } from '../../context/FinanceContext';
import { cashFlowSeries, netWorthTrend } from '../../utils/analytics';
import { CHART_COLORS } from '../../utils/constants';
import { formatCompact, formatCurrency, formatMonth } from '../../utils/formatters';

const VIEWS = [
  { value: 'flow', label: 'Cash flow' },
  { value: 'savings', label: 'Net worth trend' },
];

const AXIS = { stroke: 'rgb(var(--ink) / 0.45)', fontSize: 11, tickLine: false, axisLine: false };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-ink/10 bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-ink/60">{formatMonth(label)}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-ink">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-ink/60">{entry.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{formatCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex gap-4 text-xs text-ink/60">
      {[
        ['Income', CHART_COLORS.income],
        ['Expense', CHART_COLORS.expense],
      ].map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Monthly income vs expense bars, with a toggle to the net-worth (savings + receivables − debts) trend. */
export default function CashFlowChart() {
  const { transactions, ledger, accounts, netWorth } = useFinance();
  const [view, setView] = useState('flow');

  const flow = useMemo(() => cashFlowSeries(transactions), [transactions]);
  const trend = useMemo(() => netWorthTrend({ transactions, ledger, accounts, netWorth }), [transactions, ledger, accounts, netWorth]);

  const sixMonthNet = flow.reduce((sum, m) => sum + m.net, 0);
  const growth = trend[trend.length - 1].value - trend[0].value;

  return (
    <Card
      title={view === 'flow' ? 'Monthly cash flow' : 'Net worth trend'}
      subtitle={
        view === 'flow'
          ? `Net ${formatCurrency(sixMonthNet, { sign: true })} over 6 months`
          : `${formatCurrency(growth, { sign: true })} since ${formatMonth(trend[0].key)}`
      }
    >
      <SegmentedControl options={VIEWS} value={view} onChange={setView} size="sm" className="mb-4" />

      {view === 'flow' && <Legend />}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'flow' ? (
            <BarChart data={flow} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--ink) / 0.06)" />
              <XAxis dataKey="key" tickFormatter={formatMonth} {...AXIS} />
              <YAxis tickFormatter={formatCompact} width={40} {...AXIS} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--ink) / 0.05)', radius: 8 }} />
              <Bar dataKey="income" name="Income" fill={CHART_COLORS.income} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="expense" name="Expense" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          ) : (
            <AreaChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS.trend} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_COLORS.trend} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgb(var(--ink) / 0.06)" />
              <XAxis dataKey="key" tickFormatter={formatMonth} {...AXIS} />
              <YAxis tickFormatter={formatCompact} width={40} {...AXIS} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgb(var(--ink) / 0.25)', strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="value"
                name="Net worth"
                stroke={CHART_COLORS.trend}
                strokeWidth={2}
                fill="url(#savingsFill)"
                activeDot={{ r: 5, stroke: 'rgb(var(--surface))', strokeWidth: 2 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
