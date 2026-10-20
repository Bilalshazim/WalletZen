import { cx } from '../../utils/formatters';

export default function GlassContainer({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={cx('glass rounded-3xl border backdrop-blur-md', className)} {...props}>
      {children}
    </Tag>
  );
}
