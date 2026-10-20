import { useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, LogIn } from 'lucide-react';
import Button from '../common/Button';
import PatternPad, { MIN_PATTERN_DOTS } from './PatternPad';
import PinPad from './PinPad';
import SecurityShell from './SecurityShell';
import { useAuth } from '../../context/AuthContext';
import { useLock } from '../../context/LockContext';
import { biometricLabel, getLockout, patternSecret, pinSecret } from '../../services/quickLock';
import { cx } from '../../utils/formatters';

/**
 * Launch / resume lock: auto-prompts Face ID / fingerprint, falls back to the PIN or pattern, and finally to
 * signing in with the account (signed-in users) or removing the lock (guests).
 */
export default function LockScreen() {
  const { user, isGuest } = useAuth();
  const { config, unlockWithSecret, unlockWithBiometric, forgotSecret } = useLock();
  const hasBiometric = Boolean(config?.biometric);
  const [showPad, setShowPad] = useState(!hasBiometric);
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

  const tryBiometric = async () => {
    setBioBusy(true);
    setMessage(null);
    try {
      if (!(await unlockWithBiometric())) setMessage(`${label} didn’t verify. Use your ${isPin ? 'PIN' : 'pattern'} instead.`);
    } catch (err) {
      // NotAllowedError = cancelled, timed out, or (iOS Safari) a tap is required first — the button stays available.
      if (err.name !== 'NotAllowedError') setMessage(`${label} unavailable: ${err.message}`);
    } finally {
      setBioBusy(false);
    }
  };

  // Auto-prompt once on launch / resume.
  useEffect(() => {
    if (hasBiometric && !prompted.current) {
      prompted.current = true;
      tryBiometric();
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
          {hasBiometric && showPad && (
            <button type="button" onClick={tryBiometric} className="inline-flex items-center gap-1.5 font-medium text-accent">
              <Fingerprint size={15} /> Use {label}
            </button>
          )}
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
      {!showPad ? (
        <div className="flex w-full flex-col items-center gap-4">
          <button
            type="button"
            onClick={tryBiometric}
            disabled={bioBusy}
            aria-label={`Unlock with ${label}`}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-zen-lime to-zen-emerald text-zen-950 shadow-lg shadow-zen-lime/30 transition active:scale-95 disabled:opacity-70"
          >
            <Fingerprint size={44} className={cx(bioBusy && 'animate-pulse')} />
          </button>
          <p className="text-sm text-ink/60">{bioBusy ? `Waiting for ${label}…` : `Tap to unlock with ${label}`}</p>
          <Button variant="secondary" icon={KeyRound} onClick={() => setShowPad(true)}>
            Use {isPin ? '4-Digit PIN' : 'Pattern'}
          </Button>
        </div>
      ) : isPin ? (
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
