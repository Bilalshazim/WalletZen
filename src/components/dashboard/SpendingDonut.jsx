import { useMemo } from 'react';
import { PieChart as PieIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import { useFinance } from '../../context/FinanceContext';
import { spendingBreakdown } from '../../utils/analytics';
import { formatCurrency, formatDate, todayISO } from '../../utils/formatters';

function SliceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { label, value, color } = payload[0].payload;
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-surface/95 px-3 py-2 text-xs text-ink shadow-xl">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="pl-2 font-semibold tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

export default function SpendingDonut() {
  const { transactions } = useFinance();
  const data = useMemo(() => spendingBreakdown(transactions), [transactions]);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card title="Spending by category" subtitle={formatDate(todayISO(), { month: 'long', year: 'numeric' })}>
      {data.length === 0 ? (
        <EmptyState icon={PieIcon} title="No spending yet" message="Expenses you log this month will be broken down here." />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="relative h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="68%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="rgb(var(--surface))"
                  strokeWidth={2}
                  cornerRadius={4}
                >
                  {data.map((d) => (
                    <Cell key={d.id} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<SliceTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-ink/50">Spent</span>
              <span className="text-lg font-bold tabular-nums text-ink">{formatCurrency(total)}</span>
            </div>
          </div>

          <ul className="w-full space-y-2">
            {data.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="flex-1 truncate text-ink/70">{d.label}</span>
                <span className="text-xs text-ink/40">{Math.round((d.value / total) * 100)}%</span>
                <span className="w-24 text-right font-medium tabular-nums text-ink">{formatCurrency(d.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
