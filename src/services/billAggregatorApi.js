/**
 * Utility bill inquiry (LESCO, FESCO, SNGPL, PTCL, internet) via a 1Bill / Kuickpay aggregator.
 *
 * LIVE mode — when VITE_BILL_API_URL is set:
 *   1Bill (1LINK) and Kuickpay only expose bill inquiry to onboarded merchants, server-to-server, with credentials
 *   that must never ship in a browser bundle. WalletZen calls YOUR backend, which holds those credentials:
 *
 *   POST {VITE_BILL_API_URL}/bills/inquiry
 *   Authorization: Bearer <Firebase ID token>          (when signed in)
 *   body:     { "provider": "LESCO", "idType": "reference" | "consumer", "identifier": "04111234567890",
 *               "areaCode": "U" | "R" }                    (areaCode only for electricity reference numbers)
 *   200 body: { "amount": 12450, "dueDate": "2026-11-12", "status": "unpaid" | "paid", "billingMonth": "2026-10",
 *               "company": "Lahore Electric Supply Co.", "lateAmount": 13100,
 *               "owner": { "name": "Muhammad Ali", "fatherName": "Abdul Rehman", "address": "House 12, Street 4, Gulberg III, Lahore",
 *                          "meterNumber": "L123456", "tariff": "A-1(a) Residential", "subDivision": "Gulberg" } }
 *             (`owner` fields are optional; a top-level "consumerName" is accepted as owner.name)
 *   4xx body: { "error": "Consumer number does not exist" }
 *
 * DEMO mode — no URL configured: a deterministic mock (same identifier → same bill) so the flow can be tried
 * end-to-end. Every demo bill is tagged `source: 'demo'` and labelled "Demo" in the UI; it is not a real bill.
 */
import { auth } from './firebase';
import { UTILITY_PROVIDERS } from '../utils/constants';
import { toISODate } from '../utils/formatters';

const BASE_URL = import.meta.env.VITE_BILL_API_URL?.replace(/\/$/, '');

export const BILL_API_MODE = BASE_URL ? 'live' : 'demo';

// Don't re-poll a biller more often than this.
export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Strips spaces/dashes and checks the identifier against the biller's printed format. Returns the clean value. */
export function validateIdentifier(provider, idType, raw, areaCode = 'U') {
  const spec = UTILITY_PROVIDERS[provider]?.ids?.[idType];
  if (!spec) throw new Error(`${UTILITY_PROVIDERS[provider]?.label ?? provider} doesn't support that ID type.`);
  // Numeric IDs are often printed with spaces or dashes; ISP customer IDs may legitimately contain dashes.
  let clean = provider === 'INTERNET' ? String(raw ?? '').trim() : String(raw ?? '').replace(/[\s-]/g, '').toUpperCase();
  // Electricity references carry a U/R area code: typed as a suffix ("…406U") or chosen via `areaCode`.
  if (spec.areaCode && /^\d{14}$/.test(clean)) clean += areaCode;
  if (!spec.pattern.test(clean)) throw new Error(`Enter a valid ${spec.label} (${spec.hint}).`);
  return clean;
}

/** Splits an electricity reference ("12115741356406U") into its 14 digits and U/R area code (default U). */
export function splitReference(identifier) {
  const match = /^(\d{14})([UR])?$/.exec(String(identifier ?? '').replace(/[\s-]/g, '').toUpperCase());
  return match ? { digits: match[1], areaCode: match[2] ?? 'U' } : { digits: identifier ?? '', areaCode: 'U' };
}

async function fetchLive({ provider, idType, identifier }) {
  const headers = { 'Content-Type': 'application/json' };
  const token = await auth?.currentUser?.getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}/bills/inquiry`, {
    method: 'POST',
    headers,
    // Electricity references go out as 14 digits + a separate U/R area code, like the official PITC form.
    body: JSON.stringify(
      UTILITY_PROVIDERS[provider].ids[idType]?.areaCode
        ? { provider, idType, identifier: splitReference(identifier).digits, areaCode: splitReference(identifier).areaCode }
        : { provider, idType, identifier },
    ),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Bill inquiry failed (${response.status})`);

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate ?? '')) {
    throw new Error('Bill service returned an unexpected response.');
  }
  return {
    amount,
    dueDate: body.dueDate,
    status: body.status === 'paid' ? 'paid' : 'unpaid',
    billingMonth: body.billingMonth ?? body.dueDate.slice(0, 7),
    company: body.company ?? UTILITY_PROVIDERS[provider].company,
    owner: parseOwner(body),
    lateAmount: Number.isFinite(Number(body.lateAmount)) ? Number(body.lateAmount) : null,
    source: 'live',
  };
}

export const OWNER_FIELDS = {
  name: 'Name',
  fatherName: 'Father / husband name',
  address: 'Address',
  meterNumber: 'Meter no.',
  tariff: 'Tariff',
  subDivision: 'Sub-division',
};

/** Keeps only known, non-empty owner fields (trimmed strings). Returns null when nothing is left. */
export function cleanOwner(owner) {
  const entries = Object.keys(OWNER_FIELDS)
    .map((key) => [key, typeof owner?.[key] === 'string' ? owner[key].trim().slice(0, 160) : ''])
    .filter(([, value]) => value);
  return entries.length ? Object.fromEntries(entries) : null;
}

/** Meter-owner details as printed on the bill (live service only). */
function parseOwner(body) {
  return cleanOwner({ ...body.owner, name: body.owner?.name ?? body.consumerName });
}

/** Small deterministic hash so a given identifier always produces the same demo bill for a month. */
function hash(text) {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

async function fetchDemo({ provider, idType, identifier }) {
  await new Promise((resolve) => setTimeout(resolve, 900)); // feels like a network round-trip
  const meta = UTILITY_PROVIDERS[provider];
  const now = new Date();
  const billingMonth = toISODate(now).slice(0, 7);
  const seed = hash(`${provider}|${idType}|${identifier}|${billingMonth}`);
  const [min, max] = meta.range;
  const amount = Math.round((min + (seed % (max - min))) / 10) * 10;
  // Bill for this month, due in the upcoming month.
  const due = new Date(now.getFullYear(), now.getMonth() + 1, 5 + (seed % 16));
  return {
    amount,
    dueDate: toISODate(due),
    status: 'unpaid',
    billingMonth,
    company: meta.company,
    // Owner name/address only exist on the real bill — the demo never invents personal details.
    owner: null,
    lateAmount: Math.round(amount * 1.1),
    source: 'demo',
  };
}

/** Fetches the current bill for a biller + identifier from the live aggregator or the demo mock. */
export async function fetchUtilityBill({ provider, idType = 'reference', identifier, areaCode }) {
  const clean = validateIdentifier(provider, idType, identifier, areaCode);
  const result = await (BILL_API_MODE === 'live' ? fetchLive : fetchDemo)({ provider, idType, identifier: clean });
  return { ...result, identifier: clean };
}
