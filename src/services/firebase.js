import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

/** "AIzaSyB…Xq4 (39 chars)" — enough to recognise a key without exposing it. */
const mask = (value) => (value ? `${value.slice(0, 7)}…${value.slice(-3)} (${value.length} chars)` : '(missing)');

// Startup diagnostics (dev only): confirms which Firebase values Vite actually loaded from .env.local.
if (import.meta.env.DEV) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  console.info('[WalletZen] Firebase config', {
    apiKey: mask(config.apiKey),
    authDomain: config.authDomain ?? '(missing)',
    projectId: config.projectId ?? '(missing)',
    appId: mask(config.appId),
    configured: isFirebaseConfigured,
  });
  if (missing.length) console.warn(`[WalletZen] Missing Firebase env values: ${missing.join(', ')} — check .env.local and restart npm run dev.`);
  if (config.apiKey && !/^AIza[\w-]{35}$/.test(config.apiKey)) {
    console.warn('[WalletZen] VITE_FIREBASE_API_KEY does not look like a Firebase web API key (expected "AIza…", 39 chars).');
  }
}

const app = isFirebaseConfigured ? initializeApp(config) : null;

export const auth = app ? getAuth(app) : null;
export const googleProvider = app ? new GoogleAuthProvider() : null;

// Backend callables (functions/index.js). Region must match setGlobalOptions there.
export const functions = app ? getFunctions(app, 'us-central1') : null;

// Persistent cache keeps Firestore usable offline and syncs writes when connectivity returns.
export const db = app
  ? initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;
