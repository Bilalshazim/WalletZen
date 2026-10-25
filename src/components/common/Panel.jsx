import { cx } from '../../utils/formatters';

/** Solid surface for cards and tiles: hairline border, soft realistic shadow, no blur. */
export default function Panel({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={cx('panel rounded-2xl border', className)} {...props}>
      {children}
    </Tag>
  );
}
