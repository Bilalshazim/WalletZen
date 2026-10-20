import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  RecaptchaVerifier,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../services/firebase';
import { GUEST_UID, guestItemCount, migrateGuestData } from '../services/storageService';

const AuthContext = createContext(null);

// Everyone starts as a guest: data lives in this browser's localStorage until they sign in.
const GUEST_USER = { uid: GUEST_UID, displayName: 'Guest', email: null, phoneNumber: null, photoURL: null, isLocal: true, isGuest: true };
const EMAIL_KEY = 'walletzen:email-for-sign-in';

const AUTH_ERRORS = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/invalid-phone-number': 'That mobile number looks invalid.',
  'auth/missing-phone-number': 'Enter your mobile number.',
  'auth/invalid-verification-code': 'That code is incorrect. Check the SMS and try again.',
  'auth/code-expired': 'This code has expired. Request a new one.',
  'auth/invalid-action-code': 'This sign-in link is invalid or was already used. Request a new one.',
  'auth/expired-action-code': 'This sign-in link has expired. Request a new one.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/quota-exceeded': 'SMS quota reached for today. Try Google or email instead.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase (Authentication → Sign-in method).',
  'auth/unauthorized-domain': 'This domain is not authorized in Firebase (Authentication → Settings → Authorized domains).',
  'auth/billing-not-enabled': 'SMS sign-in needs billing enabled on the Firebase project.',
  'auth/captcha-check-failed': 'reCAPTCHA check failed. Reload the page and try again.',
  'auth/network-request-failed': 'Network error — are you online?',
};
export function authErrorMessage(error) {
  const code = error?.code ?? '';
  if (AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  if (code.startsWith('auth/api-key-not-valid') || code === 'auth/invalid-api-key') {
    return 'Firebase rejected the API key — check VITE_FIREBASE_API_KEY in .env.local.';
  }
  // Unmapped Firebase errors read like "Firebase: Error (auth/xyz)." — show the code without the noise.
  const message = (error?.message ?? 'Sign-in failed.').replace(/^Firebase:\s*/, '');
  return message.replace(/^Error \((auth\/[^)]+)\)\.?$/, 'Sign-in failed ($1).');
}

/** Normalizes a Pakistani mobile number ("0300 1234567", "3001234567", "+92…") to E.164 (+923001234567). */
export function toPakistanE164(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('92')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^3\d{9}$/.test(digits)) throw new Error('Enter a valid Pakistani mobile number, e.g. 300 1234567.');
  return `+92${digits}`;
}

const toAppUser = (fbUser) => ({
  uid: fbUser.uid,
  displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? fbUser.phoneNumber ?? 'You',
  email: fbUser.email,
  phoneNumber: fbUser.phoneNumber,
  photoURL: fbUser.photoURL,
  isLocal: false,
  isGuest: false,
});

const readStoredEmail = () => {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(GUEST_USER);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [busyMessage, setBusyMessage] = useState(null);
  const [loginPrompt, setLoginPrompt] = useState(null); // null | { reason }
  const [notice, setNotice] = useState(null); // { type, message, id }
  const [emailLinkNeedsEmail, setEmailLinkNeedsEmail] = useState(false);
  const verifierRef = useRef(null);

  const notify = (type, message) => setNotice({ type, message, id: Date.now() });

  // Session changes: signing in moves any guest data into the cloud account before switching stores.
  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(GUEST_USER);
        setLoading(false);
        return;
      }
      if (guestItemCount() > 0) {
        setBusyMessage('Moving your guest data to your account…');
        try {
          const moved = await migrateGuestData(fbUser.uid);
          notify('success', `Synced ${moved} guest item${moved === 1 ? '' : 's'} to your account`);
        } catch (error) {
          // Guest data stays on the device; it will be retried on the next sign-in.
          notify('error', `Couldn't move guest data yet: ${error.message}`);
        }
        setBusyMessage(null);
      }
      setLoginPrompt(null);
      setUser(toAppUser(fbUser));
      setLoading(false);
    });
  }, []);

  // ---------- Email link (passwordless) ----------

  const completeEmailLink = useCallback(async (email) => {
    await signInWithEmailLink(auth, email.trim(), window.location.href);
    try {
      localStorage.removeItem(EMAIL_KEY);
    } catch {
      // ignore
    }
    setEmailLinkNeedsEmail(false);
    // Drop the one-time link parameters from the address bar (keep the tab hash).
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  }, []);

  // Opened from the sign-in email: finish automatically, or ask for the address if it was opened on another device.
  useEffect(() => {
    if (!isFirebaseConfigured || !isSignInWithEmailLink(auth, window.location.href)) return;
    const stored = readStoredEmail();
    if (stored) {
      completeEmailLink(stored).catch((error) => {
        notify('error', authErrorMessage(error));
        setLoginPrompt({ reason: null });
      });
    } else {
      setEmailLinkNeedsEmail(true);
      setLoginPrompt({ reason: null });
    }
  }, [completeEmailLink]);

  const sendEmailLink = useCallback(async (email) => {
    const address = email.trim();
    await sendSignInLinkToEmail(auth, address, {
      url: `${window.location.origin}${import.meta.env.BASE_URL}`,
      handleCodeInApp: true,
    });
    try {
      localStorage.setItem(EMAIL_KEY, address);
    } catch {
      // The link still works; the user will be asked to confirm the address.
    }
  }, []);

  // ---------- Phone OTP ----------

  /** Sends an SMS code. `container` hosts the invisible reCAPTCHA. Resolves to a confirmation for verifyPhoneOtp. */
  const sendPhoneOtp = useCallback(async (phone, container) => {
    const e164 = toPakistanE164(phone);
    verifierRef.current?.clear();
    verifierRef.current = new RecaptchaVerifier(auth, container, { size: 'invisible' });
    try {
      return await signInWithPhoneNumber(auth, e164, verifierRef.current);
    } catch (error) {
      verifierRef.current?.clear();
      verifierRef.current = null;
      throw error;
    }
  }, []);

  const verifyPhoneOtp = useCallback(async (confirmation, code) => {
    await confirmation.confirm(code.replace(/\D/g, ''));
    verifierRef.current?.clear();
    verifierRef.current = null;
  }, []);

  // ---------- Google ----------

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = error.code ?? '';
      // Installed PWAs on iOS often block popups; fall back to a full-page redirect.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider);
      } else if (code === 'auth/unauthorized-domain') {
        notify('error', `Please add ${window.location.hostname} to Authorized Domains in Firebase Console`);
        console.error(
          `[WalletZen] ${window.location.hostname} is not an authorized domain. Firebase Console → Authentication → Settings → Authorized domains → Add domain.`,
        );
      } else if (code === 'auth/invalid-api-key' || code.startsWith('auth/api-key-not-valid')) {
        // Retrying with other values can't help: Google rejected this exact key, so point at the fix instead.
        notify('error', 'Firebase rejected the API key — copy apiKey again from Firebase Console → Project settings → Your apps, update .env.local and restart npm run dev.');
        console.error('[WalletZen] Firebase API key rejected by Google (API_KEY_INVALID). The key in VITE_FIREBASE_API_KEY is mistyped, deleted, or from another project.');
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        throw error;
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!user.isGuest) await fbSignOut(auth);
  }, [user]);

  /**
   * Gate for cloud-only features. Returns true when allowed; otherwise opens the "Login to Unlock Cloud Sync"
   * modal and returns false. Builds without Firebase have nothing to unlock, so everything stays available.
   */
  const requireLogin = useCallback(
    (reason) => {
      if (!user.isGuest || !isFirebaseConfigured) return true;
      setLoginPrompt({ reason });
      return false;
    },
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      isGuest: user.isGuest,
      loading,
      busyMessage,
      canSignIn: isFirebaseConfigured,
      loginPrompt,
      openLogin: () => setLoginPrompt({ reason: null }),
      closeLogin: () => setLoginPrompt(null),
      requireLogin,
      notice,
      dismissNotice: () => setNotice(null),
      emailLinkNeedsEmail,
      signInWithGoogle,
      sendEmailLink,
      completeEmailLink,
      sendPhoneOtp,
      verifyPhoneOtp,
      signOut,
    }),
    [user, loading, busyMessage, loginPrompt, requireLogin, notice, emailLinkNeedsEmail, signInWithGoogle, sendEmailLink, completeEmailLink, sendPhoneOtp, verifyPhoneOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
