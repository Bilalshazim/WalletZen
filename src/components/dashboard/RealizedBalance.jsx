import { useState } from 'react';
import { PiggyBank } from 'lucide-react';
import FitAmount from '../common/FitAmount';
import GlassContainer from '../common/GlassContainer';
import TransferModal from '../accounts/TransferModal';
import { useFinance } from '../../context/FinanceContext';
import { PROJECTION_DAYS } from '../../utils/analytics';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { cx, formatCurrency } from '../../utils/formatters';

/**
 * Current realized balance: cleared money in cash, bank and wallet accounts. Pending/future items are shown
 * separately as the projected position and never change this figure until they are marked received/paid.
 */
export default function RealizedBalance() {
  const { accounts, realizedBalance, projected } = useFinance();
  const [moving, setMoving] = useState(false);

  const byType = Object.entries(ACCOUNT_TYPES)
    .filter(([type]) => type !== 'savings')
    .map(([type, meta]) => ({ type, ...meta, total: accounts.filter((a) => a.type === type).reduce((sum, a) => sum + (a.balance ?? 0), 0) }))
    .filter((t) => t.total !== 0);
  const afterProjection = realizedBalance + projected.net;

  return (
    <GlassContainer className="relative flex flex-col overflow-hidden p-4 [container-type:inline-size] sm:p-6">
      <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#3987E5]/20 blur-3xl" />
      <p className="text-xs text-ink/60 sm:text-sm">Current balance</p>
      <FitAmount className={cx('mt-1', realizedBalance < 0 ? 'text-red-600 dark:text-red-300' : 'text-ink')}>{formatCurrency(realizedBalance)}</FitAmount>
      <p className="mt-0.5 text-[11px] text-ink/40 sm:text-xs">Cleared · cash, bank & wallets</p>

      <ul className="mt-3 space-y-0.5">
        {byType.map((t) => (
          <li key={t.type} className="flex items-center gap-1.5 text-[11px] text-ink/60">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="truncate">{t.label}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">{formatCurrency(t.total)}</span>
          </li>
        ))}
      </ul>

      {(projected.income > 0 || projected.expense > 0) && (
        <div className="mt-3 rounded-xl bg-ink/5 px-2.5 py-2 text-[11px] text-ink/60" title={`Pending income and items due in the next ${PROJECTION_DAYS} days`}>
          <p className="font-medium text-ink/70">Projected · {PROJECTION_DAYS} days</p>
          {projected.income > 0 && <p className="text-accent">+{formatCurrency(projected.income)} expected</p>}
          {projected.expense > 0 && <p>−{formatCurrency(projected.expense)} due</p>}
          <p className="mt-0.5 border-t border-ink/10 pt-0.5">
            → <span className="font-semibold tabular-nums text-ink/80">{formatCurrency(afterProjection)}</span>
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMoving(true)}
        className="mt-auto inline-flex items-center gap-1.5 self-start pt-3 text-xs font-medium text-accent hover:underline"
      >
        <PiggyBank size={14} /> Move to savings
      </button>

      <TransferModal open={moving} toSavings onClose={() => setMoving(false)} />
    </GlassContainer>
  );
}
