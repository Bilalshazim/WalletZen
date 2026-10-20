import { useState } from 'react';
import { PiggyBank, Plus } from 'lucide-react';
import AccountIcon from '../common/AccountIcon';
import FitAmount from '../common/FitAmount';
import GlassContainer from '../common/GlassContainer';
import AddAccountModal from '../accounts/AddAccountModal';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency } from '../../utils/formatters';

/** Total saved, broken down by the savings vaults that hold it. */
export default function SavingsSummary() {
  const { accounts } = useFinance();
  const [adding, setAdding] = useState(false);

  const vaults = accounts.filter((a) => a.type === 'savings').sort((a, b) => b.balance - a.balance);
  const total = vaults.reduce((sum, a) => sum + (a.balance ?? 0), 0);

  return (
    <GlassContainer className="relative flex flex-col overflow-hidden p-4 [container-type:inline-size] sm:p-6">
      <span className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#9085E9]/20 blur-3xl" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink/60 sm:text-sm">Total savings</p>
        <PiggyBank size={16} className="shrink-0 text-[#9085E9]" />
      </div>
      <FitAmount className="mt-1 text-ink">{formatCurrency(total)}</FitAmount>
      <p className="mt-0.5 text-[11px] text-ink/40 sm:text-xs">
        {vaults.length ? `In ${vaults.length} vault${vaults.length === 1 ? '' : 's'}` : 'No savings vault yet'}
      </p>

      <div className="mt-auto pt-4">
        {vaults.length ? (
          <ul className="space-y-2">
            {vaults.map((vault) => (
              <li key={vault.id} className="flex items-center gap-2">
                <AccountIcon account={vault} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] text-ink/70 sm:text-xs">{vault.name}</span>
                    <span className="hidden text-xs font-semibold tabular-nums text-ink sm:inline">{formatCurrency(vault.balance)}</span>
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-ink sm:hidden">{formatCurrency(vault.balance)}</span>
                  {vaults.length > 1 && total > 0 && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full bg-[#9085E9]" style={{ width: `${Math.max(0, (vault.balance / total) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink/10 px-3 py-1.5 text-xs font-medium text-ink/80 transition hover:bg-ink/15"
          >
            <Plus size={14} /> Add a vault
          </button>
        )}
      </div>

      <AddAccountModal open={adding} defaultType="savings" onClose={() => setAdding(false)} />
    </GlassContainer>
  );
}
