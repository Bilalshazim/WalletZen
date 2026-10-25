import { useState } from 'react';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

const COLLAPSED = 3;
const monthName = (key) => formatDate(`${key}-01`, { month: 'short', year: 'numeric' });

/** Previous months from the official bill (newest first): units, amount billed and whether it was paid. */
export default function BillHistory({ history }) {
  const [expanded, setExpanded] = useState(false);
  if (!history?.length) return null;
  const rows = [...history].reverse();
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);

  return (
    <section className="rounded-xl border border-ink/10 p-3" aria-label="Bill history">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/50">Previous bills</p>
      <ul className="divide-y divide-ink/5">
        {visible.map((row) => {
          const paid = row.payment != null && row.payment > 0;
          return (
            <li key={row.month} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{monthName(row.month)}</p>
                {row.units != null && <p className="text-[11px] text-ink/45">{row.units} units</p>}
              </div>
              <div className="text-right">
                <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink">{row.bill != null ? formatCurrency(row.bill) : '—'}</p>
                <p className={`inline-flex items-center gap-1 text-[11px] ${paid ? 'text-accent' : 'text-ink/45'}`}>
                  {paid ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                  {paid ? `Paid ${formatCurrency(row.payment)}` : 'No payment recorded'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > COLLAPSED && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-medium text-accent hover:underline">
          {expanded ? 'Show less' : `Show all ${rows.length} months`}
        </button>
      )}
    </section>
  );
}
