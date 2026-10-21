/**
 * WalletZen API (Cloudflare Worker). Every route needs `Authorization: Bearer <Firebase ID token>`, so the Worker
 * can't be used as an open proxy or burn the AI allowance for strangers.
 *
 * POST /bills/inquiry  { provider, idType: 'reference' | 'consumer', identifier, areaCode? }
 *   → the current bill from the official PITC web bill (see pitc.js)
 * POST /scan           { images: [{ data: <base64>, mimeType }], categories: [id, …] }   (≤ 6 images)
 *   → { transactions: [...] } read from screenshots by Workers AI (see scan.js)
 *
 * Errors: { error } with a 4xx/5xx status.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApiError } from './errors.js';
import { DISCO_SLUGS, findPitcBill } from './pitc.js';
import { scanImages, validateScan } from './scan.js';

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
  if (!token) throw new ApiError(401, 'Sign in first.');
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    return payload.sub;
  } catch {
    throw new ApiError(401, 'Your session expired. Sign in again.');
  }
}

function validateBillQuery(body) {
  const { provider, idType, areaCode } = body ?? {};
  const identifier = String(body?.identifier ?? '').replace(/[\s-]/g, '');
  if (!DISCO_SLUGS[provider]) throw new ApiError(400, 'Only electricity bills (LESCO, FESCO, IESCO, …) can be fetched automatically for now.');
  if (idType === 'reference' && !/^\d{14}$/.test(identifier)) throw new ApiError(400, 'Reference number must be 14 digits.');
  if (idType === 'consumer' && !/^\d{11}$/.test(identifier)) throw new ApiError(400, 'Customer ID must be 11 digits.');
  if (idType !== 'reference' && idType !== 'consumer') throw new ApiError(400, 'Unknown ID type.');
  return { provider, idType, identifier, areaCode: areaCode === 'R' ? 'R' : 'U' };
}

const isTimeout = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError';

const ROUTES = {
  '/bills/inquiry': {
    run: async (body) => findPitcBill(validateBillQuery(body)),
    failure: (error) => (isTimeout(error) ? 'The bill website took too long to answer. Try again.' : 'Bill lookup failed. Try again later.'),
  },
  '/scan': {
    run: async (body, env) => ({ transactions: await scanImages(env.AI, validateScan(body)) }),
    // Workers AI reports an exhausted free allowance / rate limit in the error message.
    failure: (error) =>
      /limit|quota|neuron|capacity|429/i.test(String(error?.message))
        ? "Today's free scanning allowance is used up. Try again tomorrow."
        : 'The scanner could not read these images. Try again, or with clearer screenshots.',
  },
};

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const route = ROUTES[new URL(request.url).pathname];
    if (!route || request.method !== 'POST') return json({ error: 'Not found' }, 404, headers);

    try {
      await verifyUser(request, env);
      return json(await route.run(await request.json().catch(() => null), env), 200, headers);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status, headers);
      console.error(new URL(request.url).pathname, 'failed', error);
      return json({ error: route.failure(error) }, 502, headers);
    }
  },
};
