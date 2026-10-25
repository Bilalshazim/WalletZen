import Panel from './Panel';
import { cx } from '../../utils/formatters';

export default function Card({ title, subtitle, action, className, children }) {
  return (
    <Panel as="section" className={cx('p-5', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-semibold leading-snug text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink/50">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </Panel>
  );
}
