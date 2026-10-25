import { cx } from '../../utils/formatters';

/** Inset tab bar; the active option sits on a raised surface. `options` is [{ value, label, activeClass? }]. */
export default function SegmentedControl({ options, value, onChange, className, size = 'md' }) {
  return (
    <div role="tablist" className={cx('flex rounded-xl border border-ink/10 bg-ink/5 p-1', className)}>
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
              'flex-1 whitespace-nowrap rounded-lg font-medium transition duration-150',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active
                ? option.activeClass ?? 'bg-surface text-ink shadow-sm ring-1 ring-ink/10'
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
