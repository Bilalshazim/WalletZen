/**
 * Screenshot scanner on Cloudflare Workers AI (free tier, no third-party key): a vision model reads banking /
 * wallet screenshots, SMS alerts and receipts and returns transactions as JSON.
 */
import { ApiError } from './errors.js';

export const SCAN_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const MAX_IMAGES_PER_CALL = 6;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // decoded; the app sends ~200–500 KB JPEGs
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CATEGORY_ID = /^[a-z_]{1,32}$/;

const PROMPT = `You read Pakistani banking and mobile-wallet screenshots, SMS alerts and receipts.
Extract every completed transaction shown (an image may contain zero, one or several). Rules:
- type: "debit" when money left the account (sent, paid, withdrawn, purchase, debited); "credit" when money was received or credited.
- amount: the transaction amount only, as a plain number. Never the balance. "Rs. 1,250.00" or "PKR 1,250" becomes 1250.
- date: YYYY-MM-DD. "01-Oct-26" means 2026-10-01. If the year is missing, use the most recent past occurrence.
- balanceAfter: the remaining / available balance stated after this transaction; -1 when the image does not state one.
- institution: bank or wallet name (e.g. Meezan Bank, EasyPaisa, JazzCash); the shop name for a receipt paid in cash.
- counterparty: merchant, sender or recipient; empty string when not shown. reference: transaction / TID number; empty when not shown.
- category: the best match from the allowed list (expense ids for debits, income ids for credits).
- confidence: 0 to 1.
- Ignore promotions, failed or pending transactions and anything that is not a transaction.
- Answer with JSON only, matching the schema.`;

function schema(categories) {
  return {
    type: 'object',
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            imageIndex: { type: 'integer', description: 'Zero-based index of the image this transaction came from.' },
            institution: { type: 'string' },
            type: { type: 'string', enum: ['debit', 'credit'] },
            amount: { type: 'number' },
            currency: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM-DD' },
            balanceAfter: { type: 'number' },
            counterparty: { type: 'string' },
            reference: { type: 'string' },
            category: { type: 'string', enum: categories },
            confidence: { type: 'number' },
          },
          required: ['imageIndex', 'institution', 'type', 'amount', 'date', 'balanceAfter', 'category', 'confidence'],
        },
      },
    },
    required: ['transactions'],
  };
}

export function validateScan(body) {
  const { images, categories } = body ?? {};
  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES_PER_CALL) {
    throw new ApiError(400, `Send between 1 and ${MAX_IMAGES_PER_CALL} images per request.`);
  }
  for (const img of images) {
    if (!IMAGE_TYPES.has(img?.mimeType) || typeof img?.data !== 'string' || !img.data) {
      throw new ApiError(400, 'Each image needs base64 data and a JPEG, PNG or WebP type.');
    }
    if ((img.data.length * 3) / 4 > MAX_IMAGE_BYTES) throw new ApiError(400, 'An image is too large.');
  }
  const cleanCategories = Array.isArray(categories) ? [...new Set(categories.filter((c) => CATEGORY_ID.test(c)))].slice(0, 50) : [];
  if (!cleanCategories.length) throw new ApiError(400, 'Missing category list.');
  return { images, categories: cleanCategories };
}

/** Models sometimes wrap JSON in prose or code fences; take the outermost object. */
function parseModelJson(response) {
  if (response && typeof response === 'object') return response;
  const text = String(response ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON in model output');
  return JSON.parse(text.slice(start, end + 1));
}

/** Reads one batch of images. Each image is labelled so the model can report which one a transaction came from. */
async function scanBatch(ai, model, images, categories) {
  const today = new Date().toISOString().slice(0, 10);
  const content = [{ type: 'text', text: `Today is ${today}. Allowed categories: ${categories.join(', ')}.` }];
  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Image ${i}:` });
    content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
  });
  const result = await ai.run(model, {
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: schema(categories) },
    max_tokens: 4096,
    temperature: 0,
  });
  const { transactions } = parseModelJson(result?.response ?? result?.choices?.[0]?.message?.content);
  return Array.isArray(transactions) ? transactions : [];
}

/**
 * Scans up to MAX_IMAGES_PER_CALL images. Models handle few images at a time best, so each image is read on its
 * own (in parallel) and the results are merged with the right imageIndex.
 */
export async function scanImages(ai, { images, categories }, model = SCAN_MODEL) {
  const perImage = await Promise.all(
    images.map(async (img, index) => {
      const rows = await scanBatch(ai, model, [img], categories);
      return rows.map((row) => ({ ...row, imageIndex: index }));
    }),
  );
  return perImage.flat();
}
