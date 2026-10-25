import { useState } from 'react';
import { HandCoins, Plus, Trophy, Users } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import Panel from '../common/Panel';
import CommitteeFormModal from './CommitteeFormModal';
import StatusTag from './StatusTag';
import { useFinance } from '../../context/FinanceContext';
import { addMonths, daysUntil, formatCurrency, formatDate, formatDue } from '../../utils/formatters';

function CommitteeCard({ committee, accountName, onEdit }) {
  const { payCommitteeInstallment, receiveCommitteePayout } = useFinance();
  const [busy, setBusy] = useState(null);

  const { name, contribution, members, paidCount, payoutMonth, startDate, received } = committee;
  const pot = contribution * members;
  const complete = paidCount >= members;
  const nextDue = complete ? null : addMonths(startDate, paidCount);
  const payoutDate = addMonths(startDate, payoutMonth - 1);
  const progress = Math.min(100, (paidCount / members) * 100);

  const act = (kind, action) => async () => {
    setBusy(kind);
    await action(committee);
    setBusy(null);
  };

  return (
    <Panel className="p-4">
      <button type="button" onClick={() => onEdit(committee)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{name}</p>
          <p className="text-xs text-ink/50">
            {formatCurrency(contribution)} × {members} · {accountName ?? 'No account linked'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-ink/50">Payout</p>
          <p className="text-sm font-bold tabular-nums text-accent">{formatCurrency(pot)}</p>
        </div>
      </button>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-ink/60">
          <span>
            {paidCount}/{members} installments paid
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/55">
        <span className="inline-flex items-center gap-1.5">
          <Trophy size={13} className="text-amber-700 dark:text-amber-300" />
          Your turn: month {payoutMonth} ({formatDate(payoutDate, { month: 'short', year: 'numeric' })})
        </span>
        <StatusTag status={received ? 'paid' : 'pending'} label={received ? 'Received' : 'Payout pending'} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!complete && (
          <Button
            size="sm"
            icon={HandCoins}
            loading={busy === 'pay'}
            disabled={!accountName}
            onClick={act('pay', payCommitteeInstallment)}
            className={daysUntil(nextDue) < 0 ? 'ring-2 ring-red-400/40' : undefined}
          >
            Pay #{paidCount + 1} · {formatDue(nextDue)}
          </Button>
        )}
        {!received && (
          <Button
            size="sm"
            variant="secondary"
            icon={Trophy}
            loading={busy === 'receive'}
            disabled={!accountName}
            onClick={act('receive', receiveCommitteePayout)}
          >
            Receive payout
          </Button>
        )}
        {complete && received && <p className="text-xs text-accent">Commattie completed 🎉</p>}
      </div>
    </Panel>
  );
}

export default function CommattieTracker() {
  const { committees, accountsById } = useFinance();
  // `null` = closed, `{}` = new, otherwise the committee being edited.
  const [editing, setEditing] = useState(null);

  const active = committees.filter((c) => c.paidCount < c.members || !c.received);
  const monthlyCommitment = active.filter((c) => c.paidCount < c.members).reduce((sum, c) => sum + c.contribution, 0);

  return (
    <Card
      title="Commattie tracker"
      subtitle={committees.length ? `${active.length} active · ${formatCurrency(monthlyCommitment)} / month` : 'Rotating savings committees'}
      action={
        <Button size="sm" icon={Plus} onClick={() => setEditing({})}>
          New
        </Button>
      }
    >
      {committees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Commatties yet"
          message="Track monthly installments and know exactly when your payout lands."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {committees.map((c) => (
            <CommitteeCard key={c.id} committee={c} accountName={accountsById[c.accountId]?.name} onEdit={setEditing} />
          ))}
        </div>
      )}

      <CommitteeFormModal open={Boolean(editing)} committee={editing?.id ? editing : null} onClose={() => setEditing(null)} />
    </Card>
  );
}
