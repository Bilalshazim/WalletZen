/**
 * WalletZen backend (Firebase Cloud Functions).
 *
 * scanScreenshots — callable. Signed-in users send up to 6 downscaled JPEGs; Claude reads them and returns the
 * transactions as JSON. The Anthropic key lives in Secret Manager (ANTHROPIC_API_KEY) and never reaches the browser:
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 */
import Anthropic from '@anthropic-ai/sdk';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const MODEL = 'claude-opus-5-5';
const MAX_IMAGES_PER_CALL = 6;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // decoded; the client sends ~200–500 KB JPEGs
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CATEGORY_ID = /^[a-z_]{1,32}$/;

const PROMPT = `You read Pakistani banking and mobile-wallet screenshots, SMS alerts and receipts.
For each image, extract every completed transaction it shows (an image may contain zero, one or several).
- "debit" = money left the account (sent, paid, withdrawn, purchase); "credit" = money received.
- amount: the principal amount only; never the balance. Amounts like "Rs. 1,250.00" become 1250.
- date: YYYY-MM-DD. If the year is missing, assume the most recent past occurrence.
- balanceAfter: only when the image explicitly states the remaining/available balance after this transaction; otherwise -1.
- counterparty / reference: empty string when not shown.
- category: best guess from the allowed list (expense ids for debits, income ids for credits).
- Ignore promotional content, failed or pending transactions, and anything that is not a transaction.
Images are numbered from 0 in the order given.`;

function transactionSchema(categories) {
  return {
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
            balanceAfter: { type: 'number', description: 'Balance shown after the transaction; -1 when not shown.' },
            counterparty: { type: 'string', description: 'Merchant, sender or recipient name; empty if not shown.' },
            reference: { type: 'string', description: 'Transaction / TID / reference number; empty if not shown.' },
            category: { type: 'string', enum: categories },
            confidence: { type: 'number', description: 'Extraction confidence from 0 to 1.' },
          },
          required: [
            'imageIndex', 'institution', 'type', 'amount', 'currency', 'date',
            'balanceAfter', 'counterparty', 'reference', 'category', 'confidence',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['transactions'],
    additionalProperties: false,
  };
}

function validateRequest(data) {
  const { images, categories } = data ?? {};
  if (!Array.isArray(images) || images.length === 0 || images.length > MAX_IMAGES_PER_CALL) {
    throw new HttpsError('invalid-argument', `Send between 1 and ${MAX_IMAGES_PER_CALL} images per request.`);
  }
  for (const img of images) {
    if (!IMAGE_TYPES.has(img?.mimeType) || typeof img?.data !== 'string') {
      throw new HttpsError('invalid-argument', 'Each image needs base64 `data` and a JPEG/PNG/WebP `mimeType`.');
    }
    if ((img.data.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpsError('invalid-argument', 'An image is too large.');
  }
  const cleanCategories = Array.isArray(categories) ? [...new Set(categories.filter((c) => CATEGORY_ID.test(c)))].slice(0, 50) : [];
  if (!cleanCategories.length) throw new HttpsError('invalid-argument', 'Missing category list.');
  return { images, categories: cleanCategories };
}

export const scanScreenshots = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to scan screenshots.');
    const { images, categories } = validateRequest(request.data);

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const today = new Date().toISOString().slice(0, 10);

    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: transactionSchema(categories) } },
        system: PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.data } })),
              { type: 'text', text: `Today is ${today}. Extract the transactions from these ${images.length} image(s).` },
            ],
          },
        ],
      });
    } catch (error) {
      logger.error('Claude request failed', { uid: request.auth.uid, status: error?.status, message: error?.message });
      if (error instanceof Anthropic.AuthenticationError) throw new HttpsError('failed-precondition', 'The scanner AI key on the server is invalid.');
      if (error instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', 'The scanner is busy. Wait a minute and retry.');
      if (error instanceof Anthropic.BadRequestError) throw new HttpsError('invalid-argument', 'The images could not be read. Try different screenshots.');
      throw new HttpsError('unavailable', 'The scanner is temporarily unavailable. Please retry.');
    }

    if (response.stop_reason === 'refusal') throw new HttpsError('failed-precondition', 'These images could not be processed.');
    if (response.stop_reason === 'max_tokens') throw new HttpsError('out-of-range', 'Too many transactions in one batch. Try fewer images.');

    const text = response.content.find((block) => block.type === 'text')?.text;
    try {
      const { transactions } = JSON.parse(text);
      return { transactions };
    } catch {
      logger.error('Unparseable scanner output', { uid: request.auth.uid, stop_reason: response.stop_reason });
      throw new HttpsError('internal', 'The scanner returned an unexpected response. Please retry.');
    }
  },
);
