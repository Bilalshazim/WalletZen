import IconCircle from './IconCircle';
import LogoBadge from './LogoBadge';
import { getAccountIcon, getAccountIconFor } from '../../utils/accountIcons';

const ICON_SIZES = { xs: 9, sm: 11, md: 18 };
const ICON_PADDING = { xs: 'p-0.5', sm: 'p-1', md: undefined };

/**
 * Bank / wallet / cash badge. Pass a stored `account`, or a free-text `name` (e.g. from a screenshot).
 * Known institutions show their logo (brand-colored initials offline); others get a type icon.
 */
export default function AccountIcon({ account, name, size = 'md' }) {
  const brand = account ? getAccountIconFor(account) : getAccountIcon(name);
  const title = account?.name ?? name ?? brand.label;

  if (brand.icon) {
    return <IconCircle icon={brand.icon} color={brand.color} size={ICON_SIZES[size]} className={ICON_PADDING[size]} />;
  }
  return <LogoBadge domain={brand.domain} color={brand.color} initials={brand.initials} size={size} title={title} />;
}
