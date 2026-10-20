import { useState } from 'react';
import { cx } from '../../utils/formatters';

const logoUrl = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

const SIZES = {
  xs: 'h-4 w-4 p-px text-[6px]',
  sm: 'h-5 w-5 p-0.5 text-[7px]',
  md: 'h-[38px] w-[38px] p-1.5 text-[11px]',
};

/**
 * Round brand badge: the site's logo on a white disc, or — when there is no domain or the logo
 * fails to load — `fallback` (an element) or brand-colored initials.
 */
export default function LogoBadge({ domain, color = '#8A8F98', initials, fallback, size = 'md', title }) {
  const [failed, setFailed] = useState(false);

  if (domain && !failed) {
    return (
      <span title={title} className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-ink/10', SIZES[size])}>
        <img
          src={logoUrl(domain)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
          // The favicon service answers unknown sites with a generic 16px globe; use the brand badge instead.
          onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setFailed(true)}
        />
      </span>
    );
  }
  if (fallback) return fallback;
  return (
    <span
      title={title}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight text-white', SIZES[size])}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}
