import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { cx } from '../../utils/formatters';

export default function Toast() {
  const finance = useFinance();
  const auth = useAuth();
  // Finance actions and auth events (sign-in, guest-data migration) share one toast slot.
  const toast = finance.toast ?? auth.notice;
  const dismissToast = finance.toast ? finance.dismissToast : auth.dismissNotice;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(dismissToast, toast.type === 'error' ? 8000 : 2500);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  if (!toast) return null;
  const Icon = toast.type === 'error' ? AlertTriangle : CheckCircle2;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-[60] flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        className={cx(
          'pointer-events-auto flex animate-sheet-up items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm shadow-[0_6px_20px_-10px_rgb(0_0_0/0.3)]',
          toast.type === 'error'
            ? 'border-red-500/30 bg-red-50 text-red-700 dark:bg-red-950/80 dark:text-red-200'
            : 'border-ink/10 bg-surface text-ink',
        )}
      >
        <Icon size={16} className={toast.type === 'error' ? 'text-red-500 dark:text-red-400' : 'text-accent'} />
        {toast.message}
      </div>
    </div>
  );
}
