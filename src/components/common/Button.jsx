import { Loader2 } from 'lucide-react';
import { cx } from '../../utils/formatters';

const VARIANTS = {
  primary:
    'bg-gradient-to-r from-zen-lime to-zen-emerald text-zen-950 font-semibold shadow-lg shadow-zen-emerald/20 hover:brightness-110',
  secondary: 'bg-ink/10 text-ink hover:bg-ink/15 border border-ink/10',
  ghost: 'text-ink/70 hover:text-ink hover:bg-ink/10',
  danger: 'bg-red-500/15 text-red-600 dark:text-red-300 hover:bg-red-500/25 border border-red-500/20',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-xs gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-6 py-3.5 text-base gap-2',
  icon: 'h-10 w-10 justify-center',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  className,
  children,
  type = 'button',
  disabled,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full transition duration-200 active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-lime/70',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={size === 'sm' ? 14 : 18} />}
      {children}
    </button>
  );
}
