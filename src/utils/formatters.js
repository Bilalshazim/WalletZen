import { CURRENCY, LOCALE } from './constants';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCurrency(amount, { sign = false } = {}) {
  const value = Number(amount) || 0;
  const formatted = currencyFormatter.format(Math.abs(value));
  if (value < 0) return `−${formatted}`;
  return sign && value > 0 ? `+${formatted}` : formatted;
}

export const formatCompact = (amount) => compactFormatter.format(Number(amount) || 0);

const foreignFormatters = {};

/** Formats an amount in its own currency (PKR, USD or EUR). */
export function formatMoney(amount, currency = 'PKR') {
  if (currency === 'PKR') return formatCurrency(amount);
  foreignFormatters[currency] ??= new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
  return foreignFormatters[currency].format(Number(amount) || 0);
}

/** Dates are stored as local 'YYYY-MM-DD' strings so they never drift across time zones. */
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const todayISO = () => toISODate(new Date());

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const monthKey = (iso) => iso.slice(0, 7);

export function addMonths(iso, count) {
  const date = parseISODate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + count);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toISODate(date);
}

export function formatDate(iso, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return parseISODate(iso).toLocaleDateString(LOCALE, options);
}

export const formatMonth = (key) => formatDate(`${key}-01`, { month: 'short' });

export function daysUntil(iso) {
  const ms = parseISODate(iso) - parseISODate(todayISO());
  return Math.round(ms / 86_400_000);
}

export function formatDue(iso) {
  const days = daysUntil(iso);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  return `Overdue by ${Math.abs(days)} day${days === -1 ? '' : 's'}`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Joins truthy class names. */
export const cx = (...classes) => classes.filter(Boolean).join(' ');
