import { useState } from 'react';
import { CalendarCheck2, Link2, PencilLine, RefreshCcw, Wallet } from 'lucide-react';
import Button from '../common/Button';
import Card from '../common/Card';
import EmptyState from '../common/EmptyState';
import BillFormModal from './BillFormModal';
import BrandIcon from './BrandIcon';
import CommitteeFormModal from './CommitteeFormModal';
import StatusTag from './StatusTag';
import { useFinance } from '../../context/FinanceContext';
import { billStatus } from '../../utils/analytics';
import { UTILITY_PROVIDERS } from '../../utils/constants';
import { cx, daysUntil, formatCurrency, formatDate, formatDue, formatMoney } from '../../utils/formatters';

/** Amount line: PKR, or "$20 ≈ Rs 5,600" for USD/EUR; utility amounts may be unknown or estimated. */
function Amount({ item }) {
  if (item.amount == null) return <span className="text-xs font-medium text-ink/50">Amount pending</span>;
  const estimated = item.source?.estimated;
  return (
    <span className="text-sm font-semibold tabular-nums text-ink">
      {item.currency !== 'PKR' ? (
        <>
          {formatMoney(item.originalAmount, item.currency)} <span className="text-xs font-normal text-ink/50">≈ {formatCurrency(item.amount)}</span>
        </>
      ) : (
        formatCurrency(item.amount)
      )}
      {estimated && <span className="ml-1 text-[10px] font-normal uppercase text-ink/40">est.</span>}
    </span>
  );
}

function UpcomingRow({ item, accountName, onEdit }) {
  const { settleUpcoming } = useFinance();
  const [busy, setBusy] = useState(false);
  const overdue = daysUntil(item.dueDate) < 0;
  const bill = item.kind === 'bill' ? item.source : null;
  // Demo bills carry sample figures: they must be replaced with the real amount before paying.
  const needsAmount = item.amount == null || bill?.source === 'demo';
  const isUtility = bill?.kind === 'utility';
  const status = isUtility ? billStatus(item.dueDate) : overdue ? 'overdue' : 'pending';

  const pay = async () => {
    setBusy(true);
    await settleUpcoming(item);
    setBusy(false);
  };

  let action;
  if (!accountName) {
    action = (
      <Button size="sm" variant="secondary" icon={Link2} onClick={() => onEdit(item)}>
        Link
      </Button>
    );
  } else if (needsAmount) {
    action = (
      <Button size="sm" variant="secondary" icon={PencilLine} onClick={() => onEdit(item)}>
        Amount
      </Button>
    );
  } else {
    action = (
      <Button size="sm" icon={isUtility ? Wallet : RefreshCcw} loading={busy} onClick={pay} aria-label={`Pay ${item.title} and update the wallet balance`}>
        <span className="sm:hidden">Pay</span>
        <span className="hidden sm:inline">{isUtility ? 'Pay & Deduct from Wallet' : 'Pay & Sync Balance'}</span>
      </Button>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
      <button type="button" onClick={() => onEdit(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <BrandIcon bill={bill} category={item.category} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{item.title}</p>
          <p className={cx('truncate text-xs', overdue ? 'text-red-600/90 dark:text-red-300/80' : 'text-ink/45')}>
            {formatDue(item.dueDate)} · {accountName ?? 'No wallet linked'}
          </p>
          {isUtility && bill.billingMonth && (
            <p className="truncate text-[11px] text-ink/45">
              {UTILITY_PROVIDERS[bill.provider]?.label} · {formatDate(`${bill.billingMonth}-01`, { month: 'short', year: 'numeric' })} bill
              {bill.owner?.name && ` · ${bill.owner.name}`}
            </p>
          )}
          {bill?.syncError && <p className="truncate text-[11px] text-amber-700 dark:text-amber-300">Auto-fetch: {bill.syncError}</p>}
          <div className="mt-1 flex items-center gap-2">
            <StatusTag status={status} />
            {bill?.source === 'demo' && <StatusTag status="demo" />}
            <Amount item={item} />
          </div>
        </div>
      </button>
      {action}
    </li>
  );
}

/**
 * Pending bills, subscriptions and Commattie installments with one-click "Pay & Sync Balance".
 * `bare` renders the list without a card; `filter` narrows the items (e.g. by bill kind).
 */
export default function UpcomingExpenses({ limit, bare = false, onShowAll, filter, emptyMessage = 'No pending bills, subscriptions or installments.' }) {
  const { upcoming, accountsById } = useFinance();
  const [editing, setEditing] = useState(null);
  const scoped = filter ? upcoming.filter(filter) : upcoming;
  const items = limit ? scoped.slice(0, limit) : scoped;
  const total = scoped.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  const list =
    items.length === 0 ? (
      <EmptyState icon={CalendarCheck2} title="All caught up" message={emptyMessage} />
    ) : (
      <ul className="-mx-2 divide-y divide-ink/5">
        {items.map((item) => (
          <UpcomingRow key={item.key} item={item} accountName={accountsById[item.accountId]?.name} onEdit={setEditing} />
        ))}
      </ul>
    );

  return (
    <>
      {bare ? (
        list
      ) : (
        <Card
          title="Upcoming bills & subscriptions"
          subtitle={scoped.length ? `${scoped.length} pending · ${formatCurrency(total)}` : undefined}
          action={
            limit && scoped.length > limit ? (
              <button type="button" onClick={onShowAll} className="text-xs font-medium text-accent hover:underline">
                See all
              </button>
            ) : null
          }
        >
          {list}
        </Card>
      )}

      <BillFormModal open={editing?.kind === 'bill'} bill={editing?.source} onClose={() => setEditing(null)} />
      <CommitteeFormModal open={editing?.kind === 'committee'} committee={editing?.source} onClose={() => setEditing(null)} />
    </>
  );
}
