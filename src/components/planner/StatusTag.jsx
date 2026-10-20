import { AlarmClock, AlertCircle, CheckCircle2, Clock, FlaskConical } from 'lucide-react';
import { cx } from '../../utils/formatters';

const STATUS = {
  paid: { label: 'Paid', icon: CheckCircle2, className: 'bg-zen-lime/15 text-accent border-zen-lime/20' },
  pending: { label: 'Pending', icon: Clock, className: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-400/20' },
  overdue: { label: 'Overdue', icon: AlertCircle, className: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20' },
  dueSoon: { label: 'Due soon', icon: AlarmClock, className: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25' },
  unpaid: { label: 'Unpaid', icon: Clock, className: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-400/20' },
  demo: { label: 'Demo', icon: FlaskConical, className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20' },
};

export default function StatusTag({ status, label: labelOverride }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', className)}>
      <Icon size={11} strokeWidth={2.6} />
      {labelOverride ?? label}
    </span>
  );
}
