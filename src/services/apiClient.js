/**
 * The WalletZen API worker (worker/): live electricity bills and the screenshot scanner.
 * Every call carries the signed-in user's Firebase ID token; the worker rejects anything else.
 */
import { auth } from './firebase';

// VITE_BILL_API_URL is the older name, kept so existing .env files keep working.
export const API_URL = (import.meta.env.VITE_API_URL || import.meta.env.VITE_BILL_API_URL || '').replace(/\/$/, '') || null;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** POSTs JSON to `path` as the signed-in user. Resolves to the parsed body; throws ApiError with the server's message. */
export async function apiPost(path, body, { signal } = {}) {
  if (!API_URL) throw new ApiError('The WalletZen API is not configured in this build.', 0);
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new ApiError('Sign in first.', 401);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Network error. Are you online?', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  return data;
}
