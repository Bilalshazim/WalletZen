/**
 * Screenshot scanner: extracts transactions from banking/wallet screenshots and receipts.
 *
 * Images are downscaled on-device, then sent in small batches to the WalletZen API worker (`POST /scan`, see
 * worker/src/scan.js), where a Cloudflare Workers AI vision model reads them. No AI key ships in this bundle.
 */
import { API_URL, apiPost } from './apiClient';
import { isFirebaseConfigured } from './firebase';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../utils/constants';

/** Scanning runs on the worker, which only answers signed-in users. */
export const isScannerConfigured = Boolean(API_URL) && isFirebaseConfigured;
export const MAX_IMAGES = 50;

const IMAGES_PER_REQUEST = 6; // must match MAX_IMAGES_PER_CALL in worker/src/scan.js
const MAX_DIMENSION = 1600; // px — plenty for reading screenshot text
const JPEG_QUALITY = 0.82;
const CATEGORIES = [...Object.keys(EXPENSE_CATEGORIES), ...Object.keys(INCOME_CATEGORIES)];

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

// Failures that will repeat for every batch (signed out, daily AI allowance used up) — stop instead of retrying.
const isFatal = (error) => error?.status === 401 || error?.status === 0 || /allowance/i.test(error?.message ?? '');

/**
 * Scans images in batches and returns a flat list of extracted transactions,
 * each tagged with `imageIndex` relative to the full `images` array.
 * `onProgress(done, total)` reports images processed so far.
 */
export async function extractTransactions(images, { onProgress, signal } = {}) {
  if (!isScannerConfigured) throw new Error('Screenshot scanning is not configured in this build.');
  const results = [];
  const failures = [];

  for (let start = 0; start < images.length; start += IMAGES_PER_REQUEST) {
    if (signal?.aborted) break;
    const batch = images.slice(start, start + IMAGES_PER_REQUEST);
    try {
      const data = await apiPost(
        '/scan',
        { images: batch.map(({ data: b64, mimeType }) => ({ data: b64, mimeType })), categories: CATEGORIES },
        { signal },
      );
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
      if (error?.name === 'AbortError') break;
      if (isFatal(error)) throw error;
      failures.push({ from: start, to: start + batch.length - 1, reason: error.message });
    }
    onProgress?.(Math.min(start + batch.length, images.length), images.length);
  }

  return { transactions: results, failures };
}
