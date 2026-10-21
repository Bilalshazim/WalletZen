/**
 * PITC web bill (bill.pitc.com.pk/<disco>bill) — the official online bill for LESCO, FESCO, IESCO and the other
 * electricity companies. Search is an ASP.NET form: GET the page for its hidden fields + cookies, POST the search,
 * follow the redirect to the bill page, then read the values out of the HTML.
 */

import { ApiError } from './errors.js';

export const DISCO_SLUGS = {
  LESCO: 'lesco', FESCO: 'fesco', IESCO: 'iesco', GEPCO: 'gepco', MEPCO: 'mepco',
  PESCO: 'pesco', HESCO: 'hesco', QESCO: 'qesco', SEPCO: 'sepco', TESCO: 'tesco',
};

const BASE = 'https://bill.pitc.com.pk';
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const TIMEOUT_MS = 15_000;
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

// ---------- HTTP session (cookie jar + ASP.NET form fields) ----------

function createSession(slug) {
  const url = `${BASE}/${slug}bill`;
  const jar = new Map();
  const keep = (response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const eq = pair.indexOf('=');
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  };
  const request = async (target, init = {}) => {
    const response = await fetch(new URL(target, url), {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': UA,
        Referer: url,
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...init.headers,
      },
    });
    keep(response);
    if (response.status >= 500) throw new ApiError(502, 'The PITC bill website is not responding. Try again later.');
    return response;
  };
  const postForm = (formHtml, fields) =>
    request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...hiddenFields(formHtml), ...fields }),
    });
  return { url, request, postForm };
}

function hiddenFields(html) {
  const fields = {};
  for (const [, tag] of html.matchAll(/<input([^>]*type="hidden"[^>]*)>/g)) {
    const name = /name="([^"]+)"/.exec(tag)?.[1];
    if (name) fields[name] = decode(/value="([^"]*)"/.exec(tag)?.[1] ?? '');
  }
  return fields;
}

function assertNoCaptcha(html) {
  if (/<img[^>]*captcha|name="[^"]*captcha[^"]*"/i.test(html)) {
    throw new ApiError(503, 'The bill website is asking for a CAPTCHA right now. Open the official bill page or try again later.');
  }
}

/**
 * Looks up the current bill. `idType` is 'reference' (14 digits + `areaCode` U/R) or 'consumer' (customer ID).
 * Resolves to the parsed bill; throws ApiError for invalid numbers or upstream problems.
 */
export async function fetchPitcBill({ provider, idType, identifier, areaCode = 'U' }) {
  const slug = DISCO_SLUGS[provider];
  if (!slug) throw new ApiError(400, `${provider} bills are not supported yet.`);
  const session = createSession(slug);

  let page = await (await session.request(session.url)).text();
  assertNoCaptcha(page);
  const search = { __EVENTTARGET: '', __EVENTARGUMENT: '', btnSearch: 'Search', searchTextBox: identifier };

  let response;
  if (idType === 'consumer') {
    // The "Customer ID" radio is an auto-postback: switch modes first so the server accepts the ID.
    page = await (await session.postForm(page, { __EVENTTARGET: 'rbSearchByList$1', rbSearchByList: 'appno', searchTextBox: '' })).text();
    response = await session.postForm(page, { ...search, rbSearchByList: 'appno' });
  } else {
    response = await session.postForm(page, { ...search, rbSearchByList: 'refno', ruCodeTextBox: areaCode === 'R' ? 'R' : '' });
  }

  const billHtml = await followToBill(session, slug, response);
  if (!billHtml) {
    throw new ApiError(
      404,
      idType === 'consumer'
        ? `No ${provider} bill found for this customer ID. Check the number and that ${provider} is the right company.`
        : `No ${provider} bill found for this reference number. Check the 14 digits, U/R and that ${provider} is the right company.`,
    );
  }
  return { ...parseBill(billHtml), provider, company: companyName(provider) };
}

/**
 * Looks the bill up with the chosen company first; if it has no such consumer — or its PITC page is down — tries
 * the other PITC companies (people often pick the wrong one). The result's `provider` says where it was found.
 */
export async function findPitcBill(query) {
  let primaryError;
  try {
    // PITC is sometimes slow to answer a cold first connection: one retry for the chosen company only, so the
    // worst case (retry + all other companies, ~3 requests each) stays under the free plan's 50 subrequests.
    return await fetchPitcBill(query).catch((error) => {
      if (isTimeout(error)) return fetchPitcBill(query);
      throw error;
    });
  } catch (error) {
    // A readable "not found" or an unreachable page can both mean "wrong company"; anything else (CAPTCHA,
    // unreadable layout) is a real answer for this consumer.
    if (error?.status !== 404 && error?.status !== 502 && !isTimeout(error)) throw error;
    primaryError = error;
  }

  const others = Object.keys(DISCO_SLUGS).filter((p) => p !== query.provider);
  // First company that has the consumer wins; null when none does.
  const found = await Promise.any(others.map((provider) => fetchPitcBill({ ...query, provider }))).catch(() => null);
  if (found) return found;
  if (primaryError.status !== 404) {
    throw new ApiError(502, `The ${query.provider} bill website is not responding right now. Try again in a few minutes.`);
  }
  throw new ApiError(
    404,
    query.idType === 'consumer'
      ? 'No bill found for this customer ID with any electricity company. Check the number.'
      : 'No bill found for this reference number with any electricity company. Check the 14 digits and U/R.',
  );
}

const isTimeout = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError';

/** A bill page (any template) rather than the search form: it shows a due date and a payable amount. */
const looksLikeBill = (html) => /DUE\s*DATE/i.test(html) && /PAYABLE/i.test(html) && !/name="searchTextBox"/.test(html);

/**
 * Follows the search result to the bill page, whatever template PITC routes this consumer to (domestic "general",
 * commercial, industrial, …). Unknown numbers bounce back to the search form: resolves to null then.
 */
async function followToBill(session, slug, response) {
  const searchPath = `/${slug}bill`;
  for (let hop = 0; hop < 4; hop += 1) {
    const location = response.headers.get('location');
    if (!location) {
      const html = response.status === 200 ? await response.text() : '';
      assertNoCaptcha(html);
      return looksLikeBill(html) ? html : null;
    }
    if (new URL(location, session.url).pathname.replace(/\/+$/, '').toLowerCase() === searchPath) return null;
    response = await session.request(location);
  }
  return null;
}

const companyName = (provider) =>
  ({
    LESCO: 'Lahore Electric Supply Co.', FESCO: 'Faisalabad Electric Supply Co.', IESCO: 'Islamabad Electric Supply Co.',
    GEPCO: 'Gujranwala Electric Power Co.', MEPCO: 'Multan Electric Power Co.', PESCO: 'Peshawar Electric Supply Co.',
    HESCO: 'Hyderabad Electric Supply Co.', QESCO: 'Quetta Electric Supply Co.', SEPCO: 'Sukkur Electric Power Co.',
    TESCO: 'Tribal Areas Electricity Supply Co.',
  })[provider];

// ---------- Bill page parsing ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m);
}
const text = (html) => decode(String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const match = (html, re) => text(re.exec(html)?.[1] ?? '');
const number = (value) => {
  const n = Number(String(value ?? '').replace(/[,\s]/g, ''));
  return value !== '' && Number.isFinite(n) ? n : null;
};

/** Value cell that follows an English label: `<span class="en-lbl">LABEL</span> … <div class="val-space…">VALUE</div>`. */
const labeled = (html, label) =>
  match(html, new RegExp(`<span class="en-lbl">${escapeRe(label)}</span>[\\s\\S]*?<div class="val-space[^"]*">([\\s\\S]*?)</div>`));
const charge = (html, label) =>
  number(match(html, new RegExp(`<span class="charges-bd-en[^"]*">${escapeRe(label)}</span>[\\s\\S]*?<span class="charges-bd-val">([^<]*)</span>`)));

/** "SEP 26" / "SEP26" → "2026-09". */
function monthKey(value) {
  const m = /([A-Z]{3})\s*'?(\d{2})/i.exec(value ?? '');
  const month = m && MONTHS[m[1].toUpperCase()];
  return month ? `20${m[2]}-${String(month).padStart(2, '0')}` : null;
}

/** "09 OCT 26" / "09-Oct-26" → "2026-10-09". */
function isoDate(value) {
  const m = /(\d{1,2})[\s-]*([A-Z]{3})[\s-]*(\d{2,4})/i.exec(value ?? '');
  const month = m && MONTHS[m[2].toUpperCase()];
  if (!month) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "M Irfan  S/O  Khuda Bakhsh, Bara Sua . Kahna" → name, father/husband name and address. */
function splitNameAddress(value) {
  const relation = /^(.*?)\s+(?:S|D|W|C)\s*\/\s*O\s+(.*)$/i.exec(value);
  const [head, rest] = relation ? [relation[1], relation[2]] : [value, ''];
  if (relation) {
    const comma = rest.indexOf(',');
    return { name: head.trim(), fatherName: (comma < 0 ? rest : rest.slice(0, comma)).trim(), address: comma < 0 ? '' : rest.slice(comma + 1).trim() };
  }
  const comma = head.indexOf(',');
  return { name: (comma < 0 ? head : head.slice(0, comma)).trim(), fatherName: '', address: comma < 0 ? '' : head.slice(comma + 1).trim() };
}

/**
 * Reads a PITC bill page. The current domestic template is read by its markup; any other template (commercial,
 * industrial, older layouts) falls back to the printed English labels in the page text, which every PITC bill shares.
 */
export function parseBill(html) {
  const bill = parseMarkup(html) ?? parseText(html);
  if (bill) return bill;
  // Log only which labels were present — never the bill's personal data.
  const plain = pageText(html);
  const labels = ['REFERENCE NO', 'BILL MONTH', 'DUE DATE', 'PAYABLE WITHIN DUE DATE', 'NAME & ADDRESS'].filter((l) => plain.includes(l));
  console.warn('unreadable PITC bill page', { length: html.length, labels });
  throw new ApiError(502, 'This bill page has a layout the app cannot read yet. Use “Open official bill” and enter the amount manually.');
}

const pageText = (html) => text(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')).toUpperCase();

/** The value printed after an English label, skipping the Urdu caption and punctuation in between. */
const after = (plain, label, valuePattern) => {
  const re = new RegExp(`${escapeRe(label)}[^A-Z0-9]*?(${valuePattern})`);
  return re.exec(plain)?.[1] ?? null;
};

/** Label-based reader for any PITC bill template (works on the page's visible text). */
function parseText(html) {
  const plain = pageText(html);
  const reference = after(plain, 'REFERENCE NO', '\\d{2}\\s?\\d{5}\\s?\\d{7}')?.replace(/\s/g, '');
  const billingMonth = monthKey(after(plain, 'BILL MONTH', '[A-Z]{3}\\s?-?\\s?\\d{2}'));
  const dueDate = isoDate(after(plain, 'DUE DATE', '\\d{1,2}[\\s-]?[A-Z]{3}[\\s-]?\\d{2,4}'));
  const payable = number(after(plain, 'PAYABLE WITHIN DUE DATE', '[\\d,]+'));
  if (!reference || !billingMonth || !dueDate || payable == null) return null;

  const paidAmount = number(after(plain, 'AMOUNT PAID', '[\\d,]+'));
  const lateMatch = /PAYABLE AFTER DUE DATE[\s\S]*?(?:TILL|AFTER)[^0-9]*\d{1,2}[^0-9]{0,6}?\s([\d,]{3,})/.exec(plain);
  const nameBlock = /NAME\s*&\s*ADDRESS[^A-Z0-9]*(.*?)\s(?:TRANSFORMER|FEEDER|SUB DIVISION|CATEGORY|METER NO|TARIFF|CONNECTED LOAD)\b/.exec(plain)?.[1] ?? '';
  const history = [];
  const historyText = /BILL HISTORY([\s\S]*?)(?:DEFERRED|BILL MONTH|$)/.exec(plain)?.[1] ?? '';
  for (const m of historyText.matchAll(/\b([A-Z]{3})\s?(\d{2})\s+(?:[A-Z]{1,3}\s+)?(\d+)\s+(\d+)(?:\s+(\d+))?(?=\s+[A-Z]{3}\s?\d{2}\b|\s+MONTH\b|\s*$)/g)) {
    const key = monthKey(`${m[1]}${m[2]}`);
    if (key) history.push({ month: key, units: number(m[3]), bill: number(m[4]), payment: m[5] ? number(m[5]) : null, status: null });
  }

  return {
    reference,
    consumerId: after(plain, 'CONSUMER ID', '\\d{6,12}'),
    billingMonth,
    issueDate: isoDate(after(plain, 'ISSUE DATE', '\\d{1,2}[\\s-]?[A-Z]{3}[\\s-]?\\d{2,4}')),
    dueDate,
    amount: payable,
    currentBill: number(after(plain, 'CURRENT BILL', '[\\d,]+')),
    arrears: number(after(plain, 'ARREARS', '[\\d,]+')),
    lateAmount: lateMatch ? number(lateMatch[1]) : null,
    units: number(after(plain, 'UNITS', '\\d+')),
    status: paidAmount != null && paidAmount >= payable ? 'paid' : 'unpaid',
    paidAmount,
    paidOn: isoDate(after(plain, 'PAYMENT DATE', '\\d{1,2}[\\s-]?[A-Z]{3}[\\s-]?\\d{2,4}')),
    owner: {
      // Page text is upper-cased for matching; names are title-cased back for display.
      ...splitNameAddress(titleCase(nameBlock)),
      meterNumber: after(plain, 'METER NO', '[A-Z0-9-]+(?:\\s[0-9]+)?') ?? '',
      tariff: after(plain, 'TARIFF', '[A-Z]-?\\d[A-Z0-9()\\-]*') ?? '',
      subDivision: titleCase(/SUB\s*DIVISION[^A-Z0-9]*([A-Z][A-Z .-]{1,40}?)\s(?:CATEGORY|STATUS|TARIFF|FEEDER)\b/.exec(plain)?.[1] ?? ''),
    },
    history: history.sort((a, b) => a.month.localeCompare(b.month)),
  };
}

const titleCase = (value) => value.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(S|D|W|C)\/o\b/g, '$1/O');

/** Reader for the current domestic ("general") template, by its CSS classes. Null when the markup doesn't match. */
function parseMarkup(html) {
  const reference = labeled(html, 'REFERENCE NO').replace(/\s/g, '');
  const billingMonth = monthKey(match(html, /<span class="right-panel-en">BILL MONTH<\/span>[\s\S]*?<div class="right-main-val">([^<]*)<\/div>/));
  const dueDate = isoDate(match(html, /<div class="right-main-val right-main-val--due">([^<]*)<\/div>/));
  if (!/^\d{14}$/.test(reference) || !billingMonth || !dueDate) return null;

  const payable = number(match(html, /<div class="payable-card-amount">([\s\S]*?)<\/div>/)) ?? charge(html, 'Grand Total');
  const paidAmount = number(match(html, /Amount Paid<\/span>\s*<span class="payable-card-paid-val">([^<]*)<\/span>/));
  const paidOn = isoDate(match(html, /Payment Date<\/span>\s*<span class="payable-card-paid-val">([^<]*)<\/span>/));
  const late = [...html.matchAll(/<div class="lp-surcharge-bottom-val">([^<]*)<\/div>/g)].map((m) => number(text(m[1])));

  const history = [];
  for (const [, row] of html.matchAll(/<div class="history-row">(.*)/g)) {
    const [month, status, units, bill, payment] = [...row.matchAll(/<div class="history-cell">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]));
    const key = monthKey(month);
    if (key) history.push({ month: key, units: number(units), bill: number(bill), payment: number(payment), status: status || null });
  }

  const owner = splitNameAddress(labeled(html, 'NAME & ADDRESS'));
  return {
    reference,
    consumerId: labeled(html, 'CONSUMER ID') || null,
    billingMonth,
    issueDate: isoDate(match(html, /ISSUE DATE<\/span>[\s\S]*?<span class="right-panel-date-val">([^<]*)<\/span>/)),
    dueDate,
    amount: payable,
    currentBill: charge(html, 'Current Bill'),
    arrears: charge(html, 'Arrears'),
    lateAmount: late[0] ?? null,
    units: number(labeled(html, 'UNITS')),
    status: paidAmount != null && payable != null && paidAmount >= payable ? 'paid' : 'unpaid',
    paidAmount,
    paidOn,
    owner: {
      ...owner,
      meterNumber: labeled(html, 'METER NO'),
      tariff: labeled(html, 'TARIFF'),
      subDivision: labeled(html, 'SUB DIVISION'),
    },
    history: history.sort((a, b) => a.month.localeCompare(b.month)),
  };
}
