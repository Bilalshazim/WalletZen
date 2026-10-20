/**
 * Gemini Vision: extracts transactions from banking/wallet screenshots and receipts.
 *
 * Uses the Interactions API through the official SDK with a JSON-schema response format.
 * Requests are sent with `store: false` so Google does not retain the financial images.
 *
 * The key comes from VITE_GEMINI_API_KEY (.env.local) at build time. Vite inlines it into the client bundle, so
 * restrict it in Google Cloud (HTTP referrer + API restrictions) — see README.
 */
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../utils/constants';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const PLACEHOLDER_KEY = 'your_gemini_api_key_here';
const API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
const MODEL = (import.meta.env.VITE_GEMINI_MODEL ?? '').trim() || DEFAULT_GEMINI_MODEL;

/** True when a real key is configured (the template placeholder doesn't count). */
export const isGeminiConfigured = Boolean(API_KEY) && API_KEY !== PLACEHOLDER_KEY;
export const MAX_IMAGES = 50;

const IMAGES_PER_REQUEST = 6; // keeps each request well under the 20 MB inline limit
const MAX_DIMENSION = 1600; // px — plenty for reading screenshot text
const JPEG_QUALITY = 0.82;

const TRANSACTION_SCHEMA = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          imageIndex: { type: 'integer', description: 'Zero-based index of the image this transaction came from.' },
          institution: { type: 'string', description: 'Bank or wallet name, e.g. Meezan Bank, EasyPaisa, JazzCash.' },
          type: { type: 'string', enum: ['debit', 'credit'] },
          amount: { type: 'number', description: 'Transaction amount as a positive number, without fees.' },
          currency: { type: 'string', description: 'ISO currency code; PKR when the screenshot shows Rs.' },
          date: { type: 'string', description: 'Transaction date as YYYY-MM-DD.' },
          balanceAfter: { type: 'number', description: 'Remaining/available balance shown after the transaction; -1 when not shown.' },
          counterparty: { type: 'string', description: 'Merchant, sender or recipient name; empty if not shown.' },
          reference: { type: 'string', description: 'Transaction / TID / reference number; empty if not shown.' },
          category: { type: 'string', enum: [...Object.keys(EXPENSE_CATEGORIES), ...Object.keys(INCOME_CATEGORIES)] },
          confidence: { type: 'number', description: 'Extraction confidence from 0 to 1.' },
        },
        required: ['imageIndex', 'institution', 'type', 'amount', 'date', 'balanceAfter', 'category', 'confidence'],
      },
    },
  },
  required: ['transactions'],
};

const PROMPT = `You read Pakistani banking and mobile-wallet screenshots, SMS alerts and receipts.
For each image, extract every completed transaction it shows (an image may contain zero, one or several).
- "debit" = money left the account (sent, paid, withdrawn, purchase); "credit" = money received.
- amount: the principal amount only; never the balance. Amounts like "Rs. 1,250.00" become 1250.
- date: YYYY-MM-DD. If the year is missing, assume the most recent past occurrence. Today is ${new Date().toISOString().slice(0, 10)}.
- balanceAfter: only when the image explicitly states the remaining/available balance after this transaction; otherwise -1.
- category: best guess from the allowed list (expense ids for debits, income ids for credits).
- Ignore promotional content, failed or pending transactions, and anything that is not a transaction.
Images are numbered from 0 in the order given.`;

/** Downscales an image file to a JPEG data payload suitable for inline upload. */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { data: dataUrl.split(',')[1], mimeType: 'image/jpeg', previewUrl: dataUrl };
}

function parseJson(text) {
  const cleaned = (text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(cleaned);
}

// Used when the primary model is temporarily overloaded (HTTP 503).
const FALLBACK_MODEL = 'gemini-3.6-flash';
const isOverloaded = (error) => /503|UNAVAILABLE|overloaded|high demand/i.test(String(error?.message ?? error));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries an overloaded model once, then falls back to the previous-generation Flash model. */
async function createWithFallback(client, request) {
  const models = MODEL === FALLBACK_MODEL ? [MODEL] : [MODEL, FALLBACK_MODEL];
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await client.interactions.create({ ...request, model });
      } catch (error) {
        if (!isOverloaded(error)) throw error;
        lastError = error;
        if (attempt === 0) await wait(1500);
      }
    }
  }
  throw lastError;
}

function friendlyError(error) {
  const message = String(error?.message ?? error);
  if (/API key|PERMISSION_DENIED|401|403/i.test(message)) return 'Gemini rejected the API key (check VITE_GEMINI_API_KEY and its restrictions).';
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) return 'Gemini rate limit reached. Wait a minute and retry.';
  if (isOverloaded(message)) return 'Gemini is busy right now (high demand). Please retry in a minute.';
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Network error — are you online?';
  return message;
}

/**
 * Scans images in batches and returns a flat list of extracted transactions,
 * each tagged with `imageIndex` relative to the full `images` array.
 * `onProgress(done, total)` reports images processed so far.
 */
export async function extractTransactions(images, { onProgress, signal } = {}) {
  if (!isGeminiConfigured) throw new Error('Screenshot scanning is not configured (VITE_GEMINI_API_KEY is missing).');
  // Loaded on demand so the SDK stays out of the startup bundle.
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: API_KEY });
  const results = [];
  const failures = [];

  for (let start = 0; start < images.length; start += IMAGES_PER_REQUEST) {
    if (signal?.aborted) break;
    const batch = images.slice(start, start + IMAGES_PER_REQUEST);
    try {
      const interaction = await createWithFallback(client, {
        store: false,
        input: [
          { type: 'text', text: PROMPT },
          ...batch.map((img) => ({ type: 'image', data: img.data, mime_type: img.mimeType })),
        ],
        response_format: { type: 'text', mime_type: 'application/json', schema: TRANSACTION_SCHEMA },
      });
      const { transactions = [] } = parseJson(interaction.output_text);
      for (const tx of transactions) {
        const local = Number(tx.imageIndex);
        if (!(local >= 0 && local < batch.length) || !(Number(tx.amount) > 0)) continue;
        const balance = Number(tx.balanceAfter);
        results.push({
          ...tx,
          amount: Number(tx.amount),
          balanceAfter: Number.isFinite(balance) && balance >= 0 ? balance : null,
          imageIndex: start + local,
        });
      }
    } catch (error) {
      const reason = friendlyError(error);
      // A bad key or quota will fail every batch — stop instead of burning through them.
      if (/API key|rate limit/.test(reason)) throw new Error(reason);
      failures.push({ from: start, to: start + batch.length - 1, reason });
    }
    onProgress?.(Math.min(start + batch.length, images.length), images.length);
  }

  return { transactions: results, failures };
}
