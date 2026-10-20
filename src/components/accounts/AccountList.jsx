import { useState } from 'react';
import { Plus, WalletCards } from 'lucide-react';
import AccountCard from './AccountCard';
import AddAccountModal from './AddAccountModal';
import Button from '../common/Button';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import { useFinance } from '../../context/FinanceContext';
import { ACCOUNT_TYPES } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';

export default function AccountList() {
  const { accounts, netWorth } = useFinance();
  // `null` = closed, `{}` = new account, otherwise the account being edited.
  const [editing, setEditing] = useState(null);

  const groups = Object.entries(ACCOUNT_TYPES)
    .map(([type, meta]) => ({ type, meta, items: accounts.filter((a) => a.type === type) }))
    .filter((group) => group.items.length);

  return (
    <div className="space-y-5">
      <Card
        title="Linked accounts"
        subtitle={`${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${formatCurrency(netWorth)} total`}
        action={
          <Button size="sm" icon={Plus} onClick={() => setEditing({})}>
            Add
          </Button>
        }
      >
        {accounts.length === 0 ? (
          <EmptyState
            icon={WalletCards}
            title="No accounts linked"
            message="Add cash in hand, a bank account, EasyPaisa/JazzCash or a savings vault."
            action={
              <Button icon={Plus} onClick={() => setEditing({})}>
                Link first account
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(ACCOUNT_TYPES).map(([type, meta]) => {
              const total = accounts.filter((a) => a.type === type).reduce((sum, a) => sum + a.balance, 0);
              return (
                <div key={type} className="rounded-2xl bg-ink/5 p-3">
                  <p className="flex items-center gap-1.5 text-xs text-ink/50">
                    <meta.icon size={13} style={{ color: meta.color }} /> {meta.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatCurrency(total)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {groups.map(({ type, meta, items }) => (
        <section key={type}>
          <h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-ink/40">{meta.label}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((account) => (
              <AccountCard key={account.id} account={account} onSelect={setEditing} />
            ))}
          </div>
        </section>
      ))}

      <AddAccountModal open={Boolean(editing)} account={editing?.id ? editing : null} onClose={() => setEditing(null)} />
    </div>
  );
}
