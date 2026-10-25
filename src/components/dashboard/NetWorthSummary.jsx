import FitAmount from '../common/FitAmount';
import Panel from '../common/Panel';
import { useFinance } from '../../context/FinanceContext';
import { cx, formatCurrency } from '../../utils/formatters';

/** Net worth = accumulated savings + net settled capital from loans (receivables − debts). */
export default function NetWorthSummary() {
  const { netWorth, savings, receivable, payable } = useFinance();

  const parts = [
    { id: 'savings', label: 'Savings', value: savings, color: '#9085E9' },
    { id: 'receivable', label: 'Owed to you', value: receivable, color: '#199E70' },
    { id: 'payable', label: 'You owe', value: -payable, color: '#D95926' },
  ];
  const barTotal = parts.reduce((sum, p) => sum + Math.abs(p.value), 0);

  return (
    <Panel className="flex flex-col p-4 [container-type:inline-size] sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink/50 sm:text-xs">Net worth</p>
      <FitAmount className={cx('mt-1', netWorth < 0 ? 'text-red-600 dark:text-red-300' : 'text-ink')}>{formatCurrency(netWorth)}</FitAmount>
      <p className="mt-0.5 text-[11px] text-ink/40 sm:text-xs">Savings + receivables − debts</p>

      <div className="mt-auto pt-4">
        {barTotal > 0 && (
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {parts
              .filter((p) => p.value !== 0)
              .map((p) => (
                <span key={p.id} style={{ width: `${(Math.abs(p.value) / barTotal) * 100}%`, backgroundColor: p.color }} />
              ))}
          </div>
        )}
        <ul className="mt-2 space-y-0.5">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 text-[11px] text-ink/60">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="truncate">{p.label}</span>
              <span className="ml-auto whitespace-nowrap tabular-nums">{formatCurrency(p.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
