import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  checkSecret,
  clearFailures,
  getLockConfig,
  getLockout,
  clearSetupSkipped,
  markSetupSkipped,
  recordFailure,
  registerBiometric,
  removeLock,
  saveLock,
  setBiometric,
  verifyBiometric,
  wasSetupSkipped,
} from '../services/quickLock';

const LockContext = createContext(null);

// Re-lock when the app comes back after this long in the background.
const BACKGROUND_GRACE_MS = 30_000;

export function LockProvider({ children }) {
  const { user, isGuest, signOut, openLogin } = useAuth();
  const uid = user.uid;
  // Read synchronously for the current uid (bumped after writes), so a user switch never shows stale lock state.
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const config = useMemo(() => getLockConfig(uid), [uid, version]);
  // The uid unlocked in this session. `locked` is derived synchronously, so app content never flashes on launch.
  const [unlockedUid, setUnlockedUid] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const hiddenAt = useRef(null);

  // Switching user (sign-in / sign-out): load that user's lock and decide whether to offer onboarding.
  useEffect(() => {
    setUnlockedUid(null);
    setSetupOpen(!getLockConfig(uid) && !isGuest && !wasSetupSkipped(uid));
  }, [uid, isGuest]);

  const locked = Boolean(config?.hash) && unlockedUid !== uid;

  // Lock again after the app sat in the background (tab hidden / PWA switched away) longer than the grace period.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > BACKGROUND_GRACE_MS) setUnlockedUid(null);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const unlock = useCallback(() => {
    clearFailures(uid);
    setUnlockedUid(uid);
  }, [uid]);

  /** Verifies a PIN/pattern secret. Resolves { ok, lockout } — lockout carries failures and remaining wait. */
  const unlockWithSecret = useCallback(
    async (secret) => {
      const lockout = getLockout(uid);
      if (lockout.remainingMs > 0) return { ok: false, lockout };
      if (await checkSecret(uid, secret)) {
        unlock();
        return { ok: true };
      }
      return { ok: false, lockout: recordFailure(uid) };
    },
    [uid, unlock],
  );

  const unlockWithBiometric = useCallback(async () => {
    if (!config?.biometric) return false;
    const ok = await verifyBiometric(config.biometric);
    if (ok) unlock();
    return ok;
  }, [config, unlock]);

  /** Saves a new PIN/pattern (and optional biometric credential) for the current user, then unlocks. */
  const completeSetup = useCallback(
    async ({ method, secret, biometric }) => {
      await saveLock(uid, { method, secret, biometric });
      bump();
      setUnlockedUid(uid);
      setSetupOpen(false);
    },
    [uid],
  );

  const enrollBiometric = useCallback(() => registerBiometric(user), [user]);

  const toggleBiometric = useCallback(
    async (enabled) => {
      const biometric = enabled ? await registerBiometric(user) : null;
      setBiometric(uid, biometric);
      bump();
    },
    [uid, user],
  );

  const skipSetup = useCallback(() => {
    markSetupSkipped(uid);
    setSetupOpen(false);
  }, [uid]);

  const disableLock = useCallback(() => {
    removeLock(uid);
    bump();
  }, [uid]);

  /**
   * Forgot PIN: signed-in users prove identity by signing in again (the lock is cleared and set up afresh);
   * guests can only remove the lock — their data was never tied to an account.
   */
  const forgotSecret = useCallback(async () => {
    removeLock(uid);
    bump();
    if (isGuest) {
      setUnlockedUid(uid);
      return;
    }
    clearSetupSkipped(uid); // offer setup again right after the re-login
    await signOut();
    openLogin();
  }, [uid, isGuest, signOut, openLogin]);

  const value = useMemo(
    () => ({
      config,
      locked,
      setupOpen,
      openSetup: () => setSetupOpen(true),
      closeSetup: () => setSetupOpen(false),
      unlockWithSecret,
      unlockWithBiometric,
      completeSetup,
      enrollBiometric,
      toggleBiometric,
      skipSetup,
      disableLock,
      forgotSecret,
    }),
    [config, locked, setupOpen, unlockWithSecret, unlockWithBiometric, completeSetup, enrollBiometric, toggleBiometric, skipSetup, disableLock, forgotSecret],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock() {
  const context = useContext(LockContext);
  if (!context) throw new Error('useLock must be used inside <LockProvider>');
  return context;
}
