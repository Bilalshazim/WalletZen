import FitAmount from '../common/FitAmount';
import GlassContainer from '../common/GlassContainer';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { cx, formatCurrency } from '../../utils/formatters';

export default function NetWorthSummary() {
  const { accounts, netWorth } = useFinance();

  const byType = Object.entries(ACCOUNT_TYPES)
    .map(([type, meta]) => ({
      type,
      ...meta,
      total: accounts.filter((a) => a.type === type).reduce((sum, a) => sum + a.balance, 0),
    }))
    .filter((t) => t.total > 0);
  const positiveTotal = byType.reduce((sum, t) => sum + t.total, 0);

  return (
    <GlassContainer className="relative flex flex-col overflow-hidden p-4 [container-type:inline-size] sm:p-6">
      <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-zen-lime/20 blur-3xl" />
      <p className="text-xs text-ink/60 sm:text-sm">Total net worth</p>
      <FitAmount className={cx('mt-1', netWorth < 0 ? 'text-red-600 dark:text-red-300' : 'text-ink')}>{formatCurrency(netWorth)}</FitAmount>
      <p className="mt-0.5 text-[11px] text-ink/40 sm:text-xs">
        Across {accounts.length} account{accounts.length === 1 ? '' : 's'}
      </p>

      {positiveTotal > 0 && (
        <div className="mt-auto pt-4">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {byType.map((t) => (
              <span key={t.type} style={{ width: `${(t.total / positiveTotal) * 100}%`, backgroundColor: t.color }} />
            ))}
          </div>
          <ul className="mt-2 space-y-0.5 sm:flex sm:flex-wrap sm:gap-x-4 sm:space-y-0">
            {byType.map((t) => (
              <li key={t.type} className="flex items-center gap-1.5 text-[11px] text-ink/60">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="truncate">{t.label}</span>
                <span className="ml-auto tabular-nums sm:ml-0">{Math.round((t.total / positiveTotal) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassContainer>
  );
}
