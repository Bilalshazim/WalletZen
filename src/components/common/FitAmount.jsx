import { cx } from '../../utils/formatters';

/**
 * Headline figure that shrinks to fit its card instead of truncating ("Rs 1,512,3…").
 * The parent must set `[container-type:inline-size]`; font size is capped at 1.5rem on phones, 2.25rem from `sm`.
 */
export default function FitAmount({ children, className }) {
  const length = String(children).length;
  // ~0.62em per glyph for semibold tabular digits in Fraunces.
  const fit = `${(100 / (length * 0.62)).toFixed(1)}cqi`;
  return (
    <p
      className={cx('whitespace-nowrap font-display font-semibold leading-tight tracking-tight tabular-nums [--max:1.5rem] sm:[--max:2.25rem]', className)}
      style={{ fontSize: `min(var(--max), ${fit})` }}
    >
      {children}
    </p>
  );
}
