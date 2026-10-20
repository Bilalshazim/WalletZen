import { cx } from '../../utils/formatters';

// Files produced by scripts/generate-icons.mjs.
const FILES = { mark: 'mark', lockup: 'logo' };
const asset = (variant, theme) => `${import.meta.env.BASE_URL}brand/${FILES[variant]}-${theme}.png`;

/**
 * WalletZen logo that swaps between the light and dark artwork with the theme.
 * `variant="mark"` is the wallet only; `variant="lockup"` includes the wordmark.
 */
export default function BrandLogo({ variant = 'mark', className }) {
  const alt = 'WalletZen';
  return (
    <>
      <img src={asset(variant, 'light')} alt={alt} draggable="false" className={cx('select-none dark:hidden', className)} />
      <img src={asset(variant, 'dark')} alt={alt} draggable="false" className={cx('hidden select-none dark:block', className)} />
    </>
  );
}
