import { getCategory } from '../../utils/constants';
import { cx } from '../../utils/formatters';

/** Selectable category chip used by entry forms, also usable as a static label. */
export default function CategoryBadge({ type = 'expense', category, selected, onClick, className }) {
  const { label, icon: Icon, color } = getCategory(type, category);
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
        selected ? 'text-ink' : 'border-ink/10 bg-ink/5 text-ink/70',
        onClick && !selected && 'hover:bg-ink/10 hover:text-ink',
        className,
      )}
      style={selected ? { borderColor: `${color}80`, backgroundColor: `${color}26` } : undefined}
    >
      <Icon size={14} style={{ color }} />
      {label}
    </Tag>
  );
}
