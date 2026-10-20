/**
 * WalletZen API (Cloudflare Worker).
 *
 * POST /bills/inquiry  { provider, idType: 'reference' | 'consumer', identifier, areaCode? }
 *   Authorization: Bearer <Firebase ID token>
 *   → the current bill from the official PITC web bill (see pitc.js), or { error } with a 4xx/5xx status.
 *
 * Only signed-in WalletZen users can call it, so the Worker can't be used as an open proxy to PITC.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { BillError, DISCO_SLUGS, fetchPitcBill } from './pitc.js';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

async function verifyUser(request, env) {
  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) throw new BillError(401, 'Sign in to fetch bills.');
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    return payload.sub;
  } catch {
    throw new BillError(401, 'Your session expired. Sign in again.');
  }
}

function validate(body) {
  const { provider, idType, areaCode } = body ?? {};
  const identifier = String(body?.identifier ?? '').replace(/[\s-]/g, '');
  if (!DISCO_SLUGS[provider]) throw new BillError(400, 'Only electricity bills (LESCO, FESCO, IESCO, …) can be fetched automatically for now.');
  if (idType === 'reference' && !/^\d{14}$/.test(identifier)) throw new BillError(400, 'Reference number must be 14 digits.');
  if (idType === 'consumer' && !/^\d{11}$/.test(identifier)) throw new BillError(400, 'Customer ID must be 11 digits.');
  if (idType !== 'reference' && idType !== 'consumer') throw new BillError(400, 'Unknown ID type.');
  return { provider, idType, identifier, areaCode: areaCode === 'R' ? 'R' : 'U' };
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const { pathname } = new URL(request.url);
    if (pathname !== '/bills/inquiry' || request.method !== 'POST') return json({ error: 'Not found' }, 404, headers);

    try {
      await verifyUser(request, env);
      const query = validate(await request.json().catch(() => null));
      return json(await fetchPitcBill(query), 200, headers);
    } catch (error) {
      if (error instanceof BillError) return json({ error: error.message }, error.status, headers);
      console.error('bill inquiry failed', error);
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return json({ error: timedOut ? 'The bill website took too long to answer. Try again.' : 'Bill lookup failed. Try again later.' }, 502, headers);
    }
  },
};
