import { useEffect, useRef, useState } from 'react';
import { Fingerprint, LogIn } from 'lucide-react';
import PatternPad, { MIN_PATTERN_DOTS } from './PatternPad';
import PinPad from './PinPad';
import SecurityShell from './SecurityShell';
import { useAuth } from '../../context/AuthContext';
import { useLock } from '../../context/LockContext';
import { biometricLabel, getLockout, patternSecret, pinSecret } from '../../services/quickLock';
import { cx } from '../../utils/formatters';

/**
 * Launch / resume lock. The PIN (or pattern) pad is always shown; Face ID / fingerprint is a shortcut on top of it:
 * prompted once on open, and if it is cancelled, fails or isn't available the user simply enters the PIN.
 * Forgotten PIN → sign in again with the account (signed-in users) or remove the lock (guests).
 */
export default function LockScreen() {
  const { user, isGuest } = useAuth();
  const { config, unlockWithSecret, unlockWithBiometric, forgotSecret } = useLock();
  const hasBiometric = Boolean(config?.biometric);
  const [error, setError] = useState(0);
  const [message, setMessage] = useState(null);
  const [waitMs, setWaitMs] = useState(() => getLockout(user.uid).remainingMs);
  const [bioBusy, setBioBusy] = useState(false);
  const prompted = useRef(false);
  const label = biometricLabel();
  const isPin = config?.method !== 'pattern';

  // Lockout countdown.
  useEffect(() => {
    if (!waitMs) return undefined;
    const timer = setInterval(() => setWaitMs(getLockout(user.uid).remainingMs), 500);
    return () => clearInterval(timer);
  }, [waitMs, user.uid]);

  const secretName = isPin ? 'PIN' : 'pattern';

  const tryBiometric = async ({ automatic = false } = {}) => {
    setBioBusy(true);
    setMessage(null);
    try {
      if (!(await unlockWithBiometric())) setMessage(`${label} didn’t verify. Enter your ${secretName}.`);
    } catch (err) {
      // NotAllowedError = cancelled, timed out, passkey removed, or a tap is required first (automatic prompt).
      // Either way the pad is right there; only explain when the user asked for biometrics themselves.
      if (err.name !== 'NotAllowedError') setMessage(`${label} isn’t available right now. Enter your ${secretName}.`);
      else if (!automatic) setMessage(`${label} cancelled. Enter your ${secretName}.`);
    } finally {
      setBioBusy(false);
    }
  };

  // Auto-prompt once on launch / resume.
  useEffect(() => {
    if (hasBiometric && !prompted.current) {
      prompted.current = true;
      tryBiometric({ automatic: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBiometric]);

  const onSecret = async (value, flags) => {
    if (flags?.tooShort) {
      setError((n) => n + 1);
      return setMessage(`Connect at least ${MIN_PATTERN_DOTS} dots.`);
    }
    const { ok, lockout } = await unlockWithSecret(isPin ? pinSecret(value) : patternSecret(value));
    if (ok) return;
    setError((n) => n + 1);
    if (lockout.remainingMs) {
      setWaitMs(lockout.remainingMs);
      setMessage(null);
    } else {
      setMessage(`Wrong ${isPin ? 'PIN' : 'pattern'}. ${lockout.attemptsLeft} attempt${lockout.attemptsLeft === 1 ? '' : 's'} left before a pause.`);
    }
  };

  const forgot = () => {
    const question = isGuest
      ? 'Remove Quick Lock from this device? Your guest data stays on the device.'
      : 'Sign in again with your Google, email or mobile account to reset Quick Lock?';
    if (window.confirm(question)) forgotSecret();
  };

  const first = user.displayName?.split(' ')[0];

  return (
    <SecurityShell
      title="WalletZen is locked"
      subtitle={first && !isGuest ? `Welcome back, ${first}` : undefined}
      footer={
        <>
          <button type="button" onClick={forgot} className="inline-flex items-center gap-1.5 text-ink/55 hover:text-ink">
            {isGuest ? (
              `Forgot ${isPin ? 'PIN' : 'pattern'}? Remove lock`
            ) : (
              <>
                <LogIn size={14} /> Login with Account Credentials
              </>
            )}
          </button>
        </>
      }
    >
      {hasBiometric && (
        <button
          type="button"
          onClick={() => tryBiometric()}
          disabled={bioBusy}
          className="inline-flex items-center gap-2 rounded-full border border-zen-lime/30 bg-zen-lime/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-zen-lime/15 active:scale-95 disabled:opacity-70"
        >
          <Fingerprint size={18} />
          {bioBusy ? `Waiting for ${label}…` : `Use ${label}`}
        </button>
      )}
      <p className="-mt-2 text-xs text-ink/50">{hasBiometric ? `or enter your ${secretName}` : `Enter your ${secretName}`}</p>

      {isPin ? (
        <PinPad onComplete={onSecret} error={error} disabled={waitMs > 0} />
      ) : (
        <PatternPad onComplete={onSecret} error={error} disabled={waitMs > 0} />
      )}

      <p role="alert" className={cx('min-h-5 text-sm', waitMs || message ? 'text-red-600 dark:text-red-300' : 'text-transparent')}>
        {waitMs > 0 ? `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.` : message ?? '·'}
      </p>
    </SecurityShell>
  );
}
