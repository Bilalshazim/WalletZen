import { useId } from 'react';
import { motion } from 'framer-motion';
import { cx } from '../../utils/formatters';
import { SNAPPY_TAB_SPRING, TAP_SCALE } from '../../utils/motion';

const DEFAULT_ACTIVE = 'bg-surface text-ink shadow-sm ring-1 ring-ink/10';

// Text colour stays on the label; surface classes (bg, ring, shadow) move to the sliding pill.
const isTextClass = (c) => /^(dark:)?text-/.test(c);

/** Inset tab bar; the active option sits on a raised surface that slides between options. `options` is [{ value, label, activeClass? }]. */
export default function SegmentedControl({ options, value, onChange, className, size = 'md' }) {
  const pillId = useId(); // one pill per control, so separate controls never animate into each other
  return (
    <div role="tablist" className={cx('flex rounded-xl border border-ink/10 bg-ink/5 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        const activeClasses = (option.activeClass ?? DEFAULT_ACTIVE).split(' ');
        return (
          <motion.button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            whileTap={TAP_SCALE}
            className={cx(
              'relative flex-1 whitespace-nowrap rounded-lg font-medium transition-colors duration-150',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              active ? activeClasses.filter(isTextClass).join(' ') : 'text-ink/60 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                transition={SNAPPY_TAB_SPRING}
                className={cx('absolute inset-0 rounded-lg', activeClasses.filter((c) => !isTextClass(c)).join(' '))}
              />
            )}
            <span className="relative">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
