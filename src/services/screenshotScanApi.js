/**
 * Screenshot scanner: extracts transactions from banking/wallet screenshots and receipts.
 *
 * Images are downscaled on-device, then sent in small batches to the `scanScreenshots` Cloud Function
 * (functions/index.js), which holds the Anthropic key and asks Claude to read them. No AI key ships in this bundle.
 */
import { httpsCallable } from 'firebase/functions';
import { functions, isFirebaseConfigured } from './firebase';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../utils/constants';

/** Scanning runs on the backend, so it needs a Firebase build (and a signed-in user). */
export const isScannerConfigured = isFirebaseConfigured;
export const MAX_IMAGES = 50;

const IMAGES_PER_REQUEST = 6; // must match MAX_IMAGES_PER_CALL in functions/index.js
const MAX_DIMENSION = 1600; // px — plenty for reading screenshot text
const JPEG_QUALITY = 0.82;
const CATEGORIES = [...Object.keys(EXPENSE_CATEGORIES), ...Object.keys(INCOME_CATEGORIES)];

const scanScreenshots = functions ? httpsCallable(functions, 'scanScreenshots', { timeout: 300_000 }) : null;

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

// Errors that will fail every batch — stop instead of burning through them.
const FATAL_CODES = new Set(['functions/unauthenticated', 'functions/failed-precondition', 'functions/resource-exhausted', 'functions/not-found']);

function friendlyError(error) {
  if (error?.code === 'functions/not-found') return 'The scanner backend is not deployed yet (scanScreenshots function missing).';
  if (error?.code === 'functions/unauthenticated') return 'Sign in to scan screenshots.';
  if (error?.code === 'functions/deadline-exceeded') return 'The scanner took too long. Try fewer images.';
  if (/Failed to fetch|NetworkError|network/i.test(String(error?.message))) return 'Network error — are you online?';
  return error?.message || 'Scanning failed.';
}

/**
 * Scans images in batches and returns a flat list of extracted transactions,
 * each tagged with `imageIndex` relative to the full `images` array.
 * `onProgress(done, total)` reports images processed so far.
 */
export async function extractTransactions(images, { onProgress, signal } = {}) {
  if (!scanScreenshots) throw new Error('Screenshot scanning needs the Firebase backend, which is not configured in this build.');
  const results = [];
  const failures = [];

  for (let start = 0; start < images.length; start += IMAGES_PER_REQUEST) {
    if (signal?.aborted) break;
    const batch = images.slice(start, start + IMAGES_PER_REQUEST);
    try {
      const { data } = await scanScreenshots({
        images: batch.map(({ data: b64, mimeType }) => ({ data: b64, mimeType })),
        categories: CATEGORIES,
      });
      for (const tx of data.transactions ?? []) {
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
      if (FATAL_CODES.has(error?.code)) throw new Error(friendlyError(error));
      failures.push({ from: start, to: start + batch.length - 1, reason: friendlyError(error) });
    }
    onProgress?.(Math.min(start + batch.length, images.length), images.length);
  }

  return { transactions: results, failures };
}
