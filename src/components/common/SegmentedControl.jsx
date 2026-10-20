import { cx } from '../../utils/formatters';

/** Pill-shaped tab bar. `options` is [{ value, label, activeClass? }]. */
export default function SegmentedControl({ options, value, onChange, className, size = 'md' }) {
  return (
    <div role="tablist" className={cx('flex rounded-full border border-ink/10 bg-ink/5 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'flex-1 whitespace-nowrap rounded-full font-medium transition duration-200',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active
                ? option.activeClass ?? 'bg-gradient-to-r from-zen-lime to-zen-emerald text-zen-950 shadow-md'
                : 'text-ink/60 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
