import { cx } from '../../utils/formatters';

/** Circular icon wrapper; pass `color` to tint the icon and its backdrop. */
export default function IconCircle({ icon: Icon, color, size = 18, className }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-ink/10 p-2.5', className)}
      style={color ? { backgroundColor: `${color}1F`, color } : undefined}
    >
      <Icon size={size} strokeWidth={2.2} />
    </span>
  );
}
