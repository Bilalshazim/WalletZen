/**
 * Quick Lock: a per-user app lock (4-digit PIN or pattern + optional device biometrics).
 *
 * - The PIN/pattern is never stored: only a salted PBKDF2-SHA-256 hash (WebCrypto).
 * - Biometrics use WebAuthn with the device's built-in authenticator (Face ID / Touch ID, Android fingerprint or
 *   screen lock, Windows Hello). Without a server, the assertion is checked on-device (user-verified flag) — this
 *   is an app lock, not a server login, and it does not encrypt the locally stored data.
 */

const PREFIX = 'walletzen:lock';
const ITERATIONS = 150_000;
const textEncoder = new TextEncoder();

const configKey = (uid) => `${PREFIX}:${uid}`;
const attemptsKey = (uid) => `${PREFIX}-attempts:${uid}`;
const skippedKey = (uid) => `${PREFIX}-skipped:${uid}`;

const toBase64Url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

// ---------- Config ----------

/** { method: 'pin' | 'pattern', salt, hash, iterations, biometric: { credentialId } | null, createdAt } */
export const getLockConfig = (uid) => (uid ? readJson(configKey(uid)) : null);
export const hasLock = (uid) => Boolean(getLockConfig(uid)?.hash);

export function removeLock(uid) {
  localStorage.removeItem(configKey(uid));
  localStorage.removeItem(attemptsKey(uid));
}

export const wasSetupSkipped = (uid) => localStorage.getItem(skippedKey(uid)) === '1';
export const markSetupSkipped = (uid) => localStorage.setItem(skippedKey(uid), '1');
export const clearSetupSkipped = (uid) => localStorage.removeItem(skippedKey(uid));

// ---------- PIN / pattern ----------

async function hashSecret(secret, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toBase64Url(bits);
}

/** Secrets are namespaced by method so a PIN "1234" and a pattern "1-2-3-4" never collide. */
export const pinSecret = (pin) => `pin:${pin}`;
export const patternSecret = (dots) => `pattern:${dots.join('-')}`;

export async function saveLock(uid, { method, secret, biometric = null }) {
  const salt = randomBytes(16);
  const config = { method, salt: toBase64Url(salt), hash: await hashSecret(secret, salt), iterations: ITERATIONS, biometric, createdAt: Date.now() };
  localStorage.setItem(configKey(uid), JSON.stringify(config));
  localStorage.removeItem(attemptsKey(uid));
  localStorage.removeItem(skippedKey(uid));
  return config;
}

export function setBiometric(uid, biometric) {
  const config = getLockConfig(uid);
  if (!config) return null;
  const next = { ...config, biometric };
  localStorage.setItem(configKey(uid), JSON.stringify(next));
  return next;
}

/** Constant-time-ish comparison of the derived hash. */
export async function checkSecret(uid, secret) {
  const config = getLockConfig(uid);
  if (!config) return false;
  const candidate = await hashSecret(secret, fromBase64Url(config.salt), config.iterations);
  let diff = candidate.length ^ config.hash.length;
  for (let i = 0; i < Math.min(candidate.length, config.hash.length); i += 1) diff |= candidate.charCodeAt(i) ^ config.hash.charCodeAt(i);
  return diff === 0;
}

// ---------- Attempt limiting (persisted, so reloading doesn't reset it) ----------

const FREE_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;

export function getLockout(uid) {
  const { failures = 0, until = 0 } = readJson(attemptsKey(uid)) ?? {};
  return { failures, until, remainingMs: Math.max(0, until - Date.now()) };
}

/** Records a wrong PIN/pattern. Every 5 failures locks input for 30 s, doubling each time. */
export function recordFailure(uid) {
  const failures = getLockout(uid).failures + 1;
  const lockouts = Math.floor(failures / FREE_ATTEMPTS);
  const until = failures % FREE_ATTEMPTS === 0 ? Date.now() + BASE_LOCKOUT_MS * 2 ** (lockouts - 1) : 0;
  localStorage.setItem(attemptsKey(uid), JSON.stringify({ failures, until }));
  return { failures, until, remainingMs: Math.max(0, until - Date.now()), attemptsLeft: FREE_ATTEMPTS - (failures % FREE_ATTEMPTS) };
}

export const clearFailures = (uid) => localStorage.removeItem(attemptsKey(uid));

// ---------- Biometrics (WebAuthn platform authenticator) ----------

export async function isBiometricAvailable() {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}

/** Human label for this device's biometric unlock. */
export function biometricLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Face ID / Touch ID';
  if (/Android/.test(ua)) return 'Fingerprint / Screen Lock';
  if (/Macintosh/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return 'Device biometrics';
}

/**
 * Registers this device's fingerprint / face unlock as a shortcut for the Quick Lock PIN. Must run from a user
 * gesture (tap).
 *
 * Browsers only expose the biometric sensor through WebAuthn, so Android Chrome stores this as a passkey in
 * Google Password Manager and iOS in iCloud Keychain. It is named after the app lock — not the user's Google
 * account — so the system sheet reads "WalletZen PIN unlock", and `hints: ['client-device']` keeps the prompt on
 * this device's own sensor instead of offering phones or security keys.
 */
export async function registerBiometric(user) {
  const first = user.displayName?.split(' ')[0];
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'WalletZen Quick Lock' }, // rp.id defaults to the current host (localhost / <user>.github.io)
      user: {
        id: textEncoder.encode(user.uid).slice(0, 64),
        name: first ? `WalletZen PIN unlock (${first})` : 'WalletZen PIN unlock',
        displayName: 'WalletZen PIN unlock',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      hints: ['client-device'],
      attestation: 'none',
      timeout: 60_000,
    },
  });
  return { credentialId: toBase64Url(credential.rawId) };
}

/**
 * Prompts Face ID / fingerprint for the stored credential. Resolves true only when the authenticator reports
 * user verification. Rejects with NotAllowedError when cancelled, timed out, the passkey was deleted, or the
 * browser requires a tap first — callers fall back to the PIN.
 */
export async function verifyBiometric(biometric) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromBase64Url(biometric.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      hints: ['client-device'],
      timeout: 60_000,
    },
  });
  // authenticatorData byte 32 = flags; bit 2 (0x04) = User Verified.
  const flags = new Uint8Array(assertion.response.authenticatorData)[32];
  return Boolean(flags & 0x04);
}
