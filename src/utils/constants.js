import {
  AppWindow,
  Banknote,
  Bot,
  BriefcaseBusiness,
  Clapperboard,
  Cloud,
  Coins,
  Dumbbell,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Home,
  KeyRound,
  Landmark,
  Laptop,
  Music,
  Newspaper,
  Package,
  PhoneCall,
  PiggyBank,
  Repeat,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tv,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';

export const CURRENCY = 'PKR';
export const LOCALE = 'en-PK';

// Account-type colors come from the same validated palette (used by the net-worth split bar).
export const ACCOUNT_TYPES = {
  cash: { label: 'Cash in Hand', icon: Banknote, color: '#199E70' },
  bank: { label: 'Bank Account', icon: Landmark, color: '#3987E5' },
  wallet: { label: 'Mobile Wallet', icon: Smartphone, color: '#D95926' },
  savings: { label: 'Savings Vault', icon: PiggyBank, color: '#9085E9' },
};

export const WALLET_PROVIDERS = ['EasyPaisa', 'JazzCash', 'SadaPay', 'NayaPay', 'Other'];

// Expense heads are split into fixed monthly heads and daily-usage heads.
// Colors form a colorblind-validated categorical palette that holds on both the light and dark surfaces.
export const EXPENSE_CATEGORIES = {
  home: { label: 'Home / Ghar', group: 'fixed', icon: Home, color: '#3987E5' },
  commattie: { label: 'Commattie', group: 'fixed', icon: Users, color: '#D95926' },
  rent: { label: 'Rent', group: 'fixed', icon: KeyRound, color: '#199E70' },
  utility: { label: 'Utility Bills', group: 'fixed', icon: Zap, color: '#C98500' },
  food: { label: 'Food', group: 'daily', icon: UtensilsCrossed, color: '#D55181' },
  fuel: { label: 'Fuel', group: 'daily', icon: Fuel, color: '#008300' },
  mobile: { label: 'Mobile Packages', group: 'daily', icon: Smartphone, color: '#9085E9' },
  personal: { label: 'Personal', group: 'daily', icon: ShoppingBag, color: '#E66767' },
  subscriptions: { label: 'Subscriptions', group: 'fixed', icon: Repeat, color: '#9085E9' },
};

// Income vs expense: a pair distinguishable under red-green colorblindness. Trend follows the theme accent.
export const CHART_COLORS = { income: '#199E70', expense: '#D95926', trend: 'rgb(var(--trend))' };

export const INCOME_CATEGORIES = {
  salary: { label: 'Salary', icon: BriefcaseBusiness, color: '#199E70' },
  business: { label: 'Business', icon: Coins, color: '#3987E5' },
  freelance: { label: 'Freelance', icon: Laptop, color: '#9085E9' },
  commattie_payout: { label: 'Commattie Payout', icon: Users, color: '#C98500' },
  gift: { label: 'Gift / Other', icon: Gift, color: '#D55181' },
};

export const CATEGORY_GROUPS = [
  { id: 'fixed', label: 'Fixed Heads' },
  { id: 'daily', label: 'Daily Usage' },
];

const FALLBACK_CATEGORY = { label: 'Other', icon: Wallet, color: '#94A3B8' };

export function getCategory(type, id) {
  const source = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return source[id] ?? FALLBACK_CATEGORY;
}

// ---------- Contacts, debts & receivables ----------

/** How a person relates to you. A contact's ledger balance can still move either way. */
export const CONTACT_CATEGORIES = {
  payee: { label: 'Payee', hint: 'Someone you pay or get paid by', color: '#3987E5' },
  debtor: { label: 'Debtor', hint: 'Owes you money', color: '#199E70' },
  creditor: { label: 'Creditor', hint: 'You owe them money', color: '#D95926' },
};

/**
 * Non-routine loan entries in a contact's ledger. `owed` is the effect on what the contact owes you
 * (+ = receivable grows), `cash` the effect on the linked account (if any). Neither counts as income or expense.
 */
export const LEDGER_KINDS = {
  lent: { label: 'They owe me', verb: 'Receivable added', owed: 1, cash: -1 },
  borrowed: { label: 'I owe them', verb: 'Payable added', owed: -1, cash: 1 },
  collected: { label: 'They paid me back', verb: 'Received back', owed: -1, cash: 1 },
  repaid: { label: 'I paid them back', verb: 'Paid back', owed: 1, cash: -1 },
};

/** The two everyday ways to add a debt; each maps to a ledger kind and a default contact category. */
export const DEBT_DIRECTIONS = {
  receivable: { kind: 'lent', category: 'debtor', title: 'Add receivable', question: 'Who owes you?', settle: 'collected' },
  payable: { kind: 'borrowed', category: 'creditor', title: 'Add payable', question: 'Who do you owe?', settle: 'repaid' },
};

export const CURRENCIES = ['PKR', 'USD', 'EUR'];
/** Foreign currencies convert to PKR at a user-editable rate (Settings). */
export const FOREIGN_CURRENCIES = {
  USD: { symbol: '$', defaultRate: 280 },
  EUR: { symbol: '€', defaultRate: 320 },
};
export const currencySymbol = (code) => FOREIGN_CURRENCIES[code]?.symbol ?? 'Rs';

export const BILLING_CYCLES = {
  monthly: { label: 'Monthly', months: 1 },
  yearly: { label: 'Yearly', months: 12 },
  once: { label: 'One-time', months: 0 },
};

/** Utility billers. Electricity companies are fetched live via the API worker; the rest are demo for now. */
// Identifier formats printed on Pakistani utility bills. `pattern` validates the cleaned value.
// Electricity (DISCO) reference numbers are 14 digits followed by an area code: U = Urban, R = Rural.
export const AREA_CODES = { U: 'Urban', R: 'Rural' };
const DISCO_IDS = {
  reference: { label: 'Reference no.', hint: '14 digits + U/R', pattern: /^\d{14}[UR]$/, areaCode: true },
  consumer: { label: 'Customer ID', hint: '11 digits', pattern: /^\d{11}$/ },
};

/** Official PITC web bill for each electricity company; the API worker (worker/) reads live bills from it. */
const pitc = (code) => `https://bill.pitc.com.pk/${code}bill`;
const disco = (label, company, slug) => ({
  label,
  company,
  kind: 'Electricity',
  icon: Zap,
  ids: DISCO_IDS,
  officialBillUrl: pitc(slug),
  range: [3000, 26000],
});

export const UTILITY_PROVIDERS = {
  LESCO: disco('LESCO', 'Lahore Electric Supply Co.', 'lesco'),
  FESCO: disco('FESCO', 'Faisalabad Electric Supply Co.', 'fesco'),
  IESCO: disco('IESCO', 'Islamabad Electric Supply Co.', 'iesco'),
  GEPCO: disco('GEPCO', 'Gujranwala Electric Power Co.', 'gepco'),
  MEPCO: disco('MEPCO', 'Multan Electric Power Co.', 'mepco'),
  PESCO: disco('PESCO', 'Peshawar Electric Supply Co.', 'pesco'),
  HESCO: disco('HESCO', 'Hyderabad Electric Supply Co.', 'hesco'),
  QESCO: disco('QESCO', 'Quetta Electric Supply Co.', 'qesco'),
  SEPCO: disco('SEPCO', 'Sukkur Electric Power Co.', 'sepco'),
  TESCO: disco('TESCO', 'Tribal Areas Electricity Supply Co.', 'tesco'),
  SNGPL: {
    label: 'SNGPL',
    company: 'Sui Northern Gas Pipelines Ltd.',
    kind: 'Gas',
    icon: Flame,
    ids: { consumer: { label: 'Consumer no.', hint: '11 digits', pattern: /^\d{11}$/ } },
    range: [800, 9000],
  },
  PTCL: {
    label: 'PTCL',
    company: 'Pakistan Telecommunication Co.',
    kind: 'Landline / Broadband',
    icon: PhoneCall,
    ids: {
      consumer: { label: 'Account ID', hint: '8–12 digits', pattern: /^\d{8,12}$/ },
      reference: { label: 'Landline no.', hint: 'e.g. 0423xxxxxxx', pattern: /^0\d{9,10}$/ },
    },
    range: [1800, 6500],
  },
  INTERNET: {
    label: 'Internet',
    company: 'Internet service provider',
    kind: 'Internet',
    icon: Wifi,
    ids: { consumer: { label: 'Customer ID', hint: '4–20 characters', pattern: /^[A-Za-z0-9-]{4,20}$/ } },
    range: [2500, 7000],
  },
};

/** Quick-pick subscriptions. `domain` is used to show the brand's logo. */
export const SUBSCRIPTION_PRESETS = [
  { name: 'Netflix', domain: 'netflix.com', icon: 'Clapperboard', currency: 'PKR' },
  { name: 'Spotify', domain: 'spotify.com', icon: 'Music', currency: 'PKR' },
  { name: 'YouTube Premium', domain: 'youtube.com', icon: 'Tv', currency: 'PKR' },
  { name: 'ChatGPT Plus', domain: 'chatgpt.com', icon: 'Bot', currency: 'USD' },
  { name: 'Claude', domain: 'claude.ai', icon: 'Sparkles', currency: 'USD' },
  { name: 'Claude Code', domain: 'claude.com', icon: 'Sparkles', currency: 'USD' },
  { name: 'iCloud+', domain: 'icloud.com', icon: 'Cloud', currency: 'USD' },
  { name: 'Google One', domain: 'one.google.com', icon: 'Cloud', currency: 'PKR' },
  { name: 'Canva', domain: 'canva.com', icon: 'AppWindow', currency: 'USD' },
  { name: 'Gym', domain: '', icon: 'Dumbbell', currency: 'PKR' },
];

export const SUBSCRIPTION_ICONS = { Clapperboard, Music, Tv, Bot, Sparkles, Cloud, AppWindow, Dumbbell, Gamepad2, Newspaper, GraduationCap, Package };
export const DEFAULT_SUBSCRIPTION_ICON = 'Package';
