/**
 * Bank & cash icon resolver: maps a free-text bank/wallet name to its brand identity.
 *
 * Logos are loaded from each institution's own website (via its favicon), so no trademarked artwork
 * is bundled; when a logo can't load, the brand-colored initials badge is shown instead.
 */
import { Banknote, Landmark, PiggyBank, Smartphone } from 'lucide-react';

/** Order matters only for readability — matching always prefers the longest alias. */
export const INSTITUTIONS = {
  easypaisa: { label: 'EasyPaisa', domain: 'easypaisa.com.pk', color: '#2DB34A', initials: 'EP', kind: 'wallet', aliases: ['easypaisa', 'easy paisa', 'telenor microfinance'] },
  jazzcash: { label: 'JazzCash', domain: 'jazzcash.com.pk', color: '#E31E24', initials: 'JC', kind: 'wallet', aliases: ['jazzcash', 'jazz cash', 'mobilink'] },
  sadapay: { label: 'SadaPay', domain: 'sadapay.pk', color: '#FF6B5B', initials: 'SP', kind: 'wallet', aliases: ['sadapay', 'sada pay'] },
  nayapay: { label: 'NayaPay', domain: 'nayapay.com', color: '#F26722', initials: 'NP', kind: 'wallet', aliases: ['nayapay', 'naya pay'] },
  meezan: { label: 'Meezan Bank', domain: 'meezanbank.com', color: '#6E2C8F', initials: 'MB', kind: 'bank', aliases: ['meezan'] },
  hbl: { label: 'HBL', domain: 'hbl.com', color: '#00866F', initials: 'HBL', kind: 'bank', aliases: ['hbl', 'habib bank limited', 'habib bank ltd', 'konnect'] },
  habibmetro: { label: 'HabibMetro', domain: 'habibmetro.com', color: '#00703C', initials: 'HM', kind: 'bank', aliases: ['habibmetro', 'habib metro'] },
  alfalah: { label: 'Bank Alfalah', domain: 'bankalfalah.com', color: '#D71920', initials: 'BAF', kind: 'bank', aliases: ['alfalah', 'alfa'] },
  ubl: { label: 'UBL', domain: 'ubldigital.com', color: '#0062AE', initials: 'UBL', kind: 'bank', aliases: ['ubl', 'united bank'] },
  nbp: { label: 'National Bank', domain: 'nbp.com.pk', color: '#00843D', initials: 'NBP', kind: 'bank', aliases: ['nbp', 'national bank'] },
  mcb: { label: 'MCB', domain: 'mcb.com.pk', color: '#00A651', initials: 'MCB', kind: 'bank', aliases: ['mcb', 'muslim commercial'] },
  abl: { label: 'Allied Bank', domain: 'abl.com', color: '#004C97', initials: 'ABL', kind: 'bank', aliases: ['abl', 'allied bank', 'allied'] },
  askari: { label: 'Askari Bank', domain: 'askaribank.com', color: '#005BAA', initials: 'AKB', kind: 'bank', aliases: ['askari'] },
  bankislami: { label: 'BankIslami', domain: 'bankislami.com.pk', color: '#00A19A', initials: 'BI', kind: 'bank', aliases: ['bankislami', 'bank islami'] },
  faysal: { label: 'Faysal Bank', domain: 'faysalbank.com', color: '#007A4D', initials: 'FB', kind: 'bank', aliases: ['faysal'] },
  dib: { label: 'Dubai Islamic Bank', domain: 'dibpak.com', color: '#0F6B3E', initials: 'DIB', kind: 'bank', aliases: ['dib', 'dubai islamic'] },
  js: { label: 'JS Bank', domain: 'jsbl.com', color: '#00539B', initials: 'JS', kind: 'bank', aliases: ['js bank', 'jsbl', 'zindigi'] },
  soneri: { label: 'Soneri Bank', domain: 'soneribank.com', color: '#C8102E', initials: 'SB', kind: 'bank', aliases: ['soneri'] },
  scb: { label: 'Standard Chartered', domain: 'sc.com', color: '#0473EA', initials: 'SC', kind: 'bank', aliases: ['standard chartered', 'scb'] },
};

const CASH = { key: 'cash', label: 'Cash', icon: Banknote, color: '#199E70', initials: 'Rs', kind: 'cash' };
const CASH_ALIASES = ['cash', 'cash in hand', 'pocket', 'naqd', 'naqad'];
const FALLBACKS = {
  bank: { key: 'bank', label: 'Bank', icon: Landmark, color: '#3987E5', kind: 'bank' },
  wallet: { key: 'wallet', label: 'Wallet', icon: Smartphone, color: '#D95926', kind: 'wallet' },
  savings: { key: 'savings', label: 'Savings', icon: PiggyBank, color: '#9085E9', kind: 'savings' },
};

const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Short aliases (UBL, NBP, DIB…) must match a whole word so "public" never resolves to UBL.
const MATCHERS = Object.entries(INSTITUTIONS)
  .flatMap(([key, inst]) => inst.aliases.map((alias) => ({ key, alias: squash(alias), wholeWord: squash(alias).length <= 4 })))
  .sort((a, b) => b.alias.length - a.alias.length);

function findInstitution(name) {
  if (!name) return null;
  const joined = squash(name);
  const tokens = words(name);
  const hit = MATCHERS.find(({ alias, wholeWord }) => (wholeWord ? tokens.includes(alias) : joined.includes(alias)));
  return hit ? { key: hit.key, ...INSTITUTIONS[hit.key] } : null;
}

/**
 * Resolves a bank/wallet/cash name to `{ key, label, color, domain?, initials?, icon?, kind }`.
 * Unrecognized names fall back to a generic bank building.
 */
export function getAccountIcon(bankName) {
  const institution = findInstitution(bankName);
  if (institution) return institution;
  const tokens = words(bankName ?? '').join(' ');
  if (CASH_ALIASES.some((alias) => tokens === alias || tokens.startsWith(`${alias} `) || tokens.endsWith(` ${alias}`))) return CASH;
  return FALLBACKS.bank;
}

/** Resolves a stored account, using its type and wallet provider as extra hints. */
export function getAccountIconFor(account) {
  if (!account) return FALLBACKS.bank;
  if (account.type === 'cash') return CASH;
  const institution = findInstitution(account.provider) ?? findInstitution(account.name);
  if (institution) return institution;
  return FALLBACKS[account.type] ?? FALLBACKS.bank;
}
