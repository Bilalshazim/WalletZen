import IconCircle from '../common/IconCircle';
import LogoBadge from '../common/LogoBadge';
import { DEFAULT_SUBSCRIPTION_ICON, getCategory, SUBSCRIPTION_ICONS, UTILITY_PROVIDERS } from '../../utils/constants';

/** Brand logo for subscriptions (by domain), biller icon for utilities, category icon otherwise. */
export default function BrandIcon({ bill, category, small = false }) {
  const { color, icon: categoryIcon } = getCategory('expense', bill?.category ?? category);

  const icon =
    bill?.kind === 'utility'
      ? UTILITY_PROVIDERS[bill.provider]?.icon ?? categoryIcon
      : bill?.kind === 'subscription'
        ? SUBSCRIPTION_ICONS[bill.icon] ?? SUBSCRIPTION_ICONS[DEFAULT_SUBSCRIPTION_ICON]
        : categoryIcon;
  const iconBadge = small ? <IconCircle icon={icon} color={color} size={11} className="p-1" /> : <IconCircle icon={icon} color={color} />;

  if (bill?.kind === 'subscription' && bill.brandDomain) {
    return <LogoBadge domain={bill.brandDomain} fallback={iconBadge} size={small ? 'sm' : 'md'} title={bill.title} />;
  }
  return iconBadge;
}
