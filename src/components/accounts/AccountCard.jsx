import { ChevronRight } from 'lucide-react';
import GlassContainer from '../common/GlassContainer';
import AccountIcon from '../common/AccountIcon';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { getAccountIconFor } from '../../utils/accountIcons';
import { cx, formatCurrency } from '../../utils/formatters';

export default function AccountCard({ account, onSelect }) {
  const meta = ACCOUNT_TYPES[account.type] ?? ACCOUNT_TYPES.cash;
  const negative = account.balance < 0;
  const brand = getAccountIconFor(account);

  return (
    <GlassContainer
      as="button"
      type="button"
      onClick={() => onSelect(account)}
      className="group relative w-full overflow-hidden p-4 text-left transition hover:border-ink/20 hover:bg-ink/[0.07]"
    >
      <span
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: brand.color }}
      />
      <div className="flex items-center gap-3">
        <AccountIcon account={account} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{account.name}</p>
          <p className="truncate text-xs text-ink/50">{brand.domain ? `${brand.label} · ${meta.label}` : account.provider ?? meta.label}</p>
        </div>
        <ChevronRight size={18} className="text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-ink/60" />
      </div>
      <p className={cx('mt-4 text-2xl font-bold tabular-nums', negative ? 'text-red-600 dark:text-red-300' : 'text-ink')}>
        {formatCurrency(account.balance)}
      </p>
    </GlassContainer>
  );
}
