import { ChevronDown } from 'lucide-react';
import { cx } from '../../utils/formatters';

const control =
  'w-full rounded-2xl border border-ink/10 bg-ink/5 px-4 py-3 text-base text-ink placeholder:text-ink/30 sm:text-sm ' +
  'outline-none transition focus:border-zen-lime/60 focus:bg-ink/[0.07] focus:ring-2 focus:ring-zen-lime/20';

export function Field({ label, hint, className, children }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/40">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }) {
  return <input className={cx(control, className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <div className="relative">
      <select className={cx(control, 'appearance-none pr-10 [&>option]:bg-surface', className)} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink/40" />
    </div>
  );
}

/** Large amount input used at the top of entry forms. */
export function AmountInput({ value, onChange, autoFocus, required = true, prefix = 'Rs' }) {
  return (
    <div className="flex items-baseline justify-center gap-2 py-2">
      <span className="text-lg font-semibold text-ink/40">{prefix}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        required={required}
        autoFocus={autoFocus}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-[14rem] bg-transparent text-center text-4xl font-bold text-ink outline-none placeholder:text-ink/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="Amount"
      />
    </div>
  );
}
