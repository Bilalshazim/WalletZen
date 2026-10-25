import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centered dialog on larger screens. */
export default function Modal({ open, onClose, title, size = 'md', children }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-zen-950/40 dark:bg-zen-950/75" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative max-h-[92dvh] w-full animate-sheet-up overflow-y-auto rounded-t-2xl border border-ink/10 bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-4px_24px_-12px_rgb(0_0_0/0.25)] sm:rounded-2xl sm:pb-5 sm:shadow-[0_12px_32px_-16px_rgb(0_0_0/0.35)] ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/20 sm:hidden" />
        <header className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="font-display text-xl font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg bg-ink/[0.06] p-2 text-ink/70 transition hover:bg-ink/10 hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
