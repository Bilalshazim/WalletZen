import Panel from './Panel';
import { cx } from '../../utils/formatters';

export function Skeleton({ className }) {
  return <span aria-hidden="true" className={cx('skeleton block', className)} />;
}

function RowsSkeleton({ rows = 4 }) {
  return (
    <ul className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </li>
      ))}
    </ul>
  );
}

function CardSkeleton({ rows }) {
  return (
    <Panel className="space-y-5 p-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2.5 w-48" />
      </div>
      <RowsSkeleton rows={rows} />
    </Panel>
  );
}

function BalanceSkeleton() {
  return (
    <Panel className="space-y-3 p-4 sm:p-6">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-7 w-3/4 sm:h-9" />
      <div className="space-y-1.5 pt-3">
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2.5 w-2/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </Panel>
  );
}

/** Placeholder for the signed-in shell while FinanceContext loads; mirrors the layout of the active tab. */
export function AppSkeleton({ tab }) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading your cashbook"
      className="mx-auto max-w-5xl space-y-5 px-4 pb-32 pt-[calc(1.25rem+env(safe-area-inset-top))]"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>

      {tab === 'dashboard' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <BalanceSkeleton />
            <BalanceSkeleton />
          </div>
          <Skeleton className="h-9 w-full rounded-xl sm:w-80" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Panel key={i} className="space-y-4 p-4">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-5 w-24" />
              </Panel>
            ))}
          </div>
          <Panel className="space-y-4 p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-44 w-full rounded-lg" />
          </Panel>
        </>
      ) : (
        <>
          <CardSkeleton rows={3} />
          <CardSkeleton rows={4} />
        </>
      )}
    </main>
  );
}

export default Skeleton;
