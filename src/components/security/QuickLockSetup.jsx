import { useEffect, useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import Button from '../common/Button';
import SegmentedControl from '../common/SegmentedControl';
import PatternPad, { MIN_PATTERN_DOTS } from './PatternPad';
import PinPad from './PinPad';
import SecurityShell from './SecurityShell';
import { useLock } from '../../context/LockContext';
import { biometricLabel, isBiometricAvailable, patternSecret, pinSecret } from '../../services/quickLock';
import { cx } from '../../utils/formatters';

const METHODS = [
  { value: 'pin', label: '4-digit PIN' },
  { value: 'pattern', label: 'Pattern' },
];

/** Pill-shaped switch. */
function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-ink/20',
      )}
    >
      <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-surface shadow-sm transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  );
}

/**
 * "Set Quick Lock": choose PIN or pattern, enter it twice, optionally enrol Face ID / fingerprint.
 * Changing an existing lock first asks for the current PIN/pattern.
 */
export default function QuickLockSetup() {
  const { config, completeSetup, enrollBiometric, skipSetup, closeSetup, unlockWithSecret } = useLock();
  const changing = Boolean(config?.hash);
  const [step, setStep] = useState(changing ? 'verify' : 'enter'); // verify → enter → confirm → biometric
  const [method, setMethod] = useState('pin');
  const [first, setFirst] = useState(null);
  const [error, setError] = useState(0);
  const [message, setMessage] = useState(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  // Changing the PIN/pattern keeps an already-enrolled Face ID / fingerprint unless switched off.
  const [bioEnabled, setBioEnabled] = useState(Boolean(config?.biometric));
  const [biometric, setBiometric] = useState(config?.biometric ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  const fail = (text) => {
    setError((n) => n + 1);
    setMessage(text);
  };

  const toSecret = (value, kind = method) => (kind === 'pin' ? pinSecret(value) : patternSecret(value));

  const onVerify = async (value, flags) => {
    if (flags?.tooShort) return fail(`Connect at least ${MIN_PATTERN_DOTS} dots.`);
    const { ok, lockout } = await unlockWithSecret(toSecret(value, config.method));
    if (ok) {
      setMessage(null);
      setStep('enter');
    } else fail(lockout.remainingMs ? `Too many attempts. Try again in ${Math.ceil(lockout.remainingMs / 1000)}s.` : 'That doesn’t match your current lock.');
  };

  const onEnter = (value, flags) => {
    if (flags?.tooShort) return fail(`Connect at least ${MIN_PATTERN_DOTS} dots.`);
    setFirst(toSecret(value));
    setMessage(null);
    setStep('confirm');
  };

  const onConfirm = (value, flags) => {
    if (flags?.tooShort || toSecret(value) !== first) {
      setFirst(null);
      setStep('enter');
      return fail(method === 'pin' ? 'PINs didn’t match. Start again.' : 'Patterns didn’t match. Start again.');
    }
    setMessage(null);
    if (bioAvailable) setStep('biometric');
    else finish(null);
  };

  const toggleBiometric = async (enabled) => {
    setMessage(null);
    if (!enabled) {
      setBioEnabled(false);
      setBiometric(null);
      return;
    }
    setBusy(true);
    try {
      // Runs from this tap, so iOS / Android show the Face ID / fingerprint prompt.
      setBiometric(await enrollBiometric());
      setBioEnabled(true);
    } catch (err) {
      setMessage(err.name === 'NotAllowedError' ? 'Biometric setup was cancelled.' : `Couldn’t enable ${biometricLabel()}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (bio = biometric) => {
    setBusy(true);
    await completeSetup({ method, secret: first, biometric: bio });
    setBusy(false);
  };

  const pad = (onComplete) =>
    (step === 'verify' ? config.method : method) === 'pin' ? (
      <PinPad key={step} onComplete={onComplete} error={error} />
    ) : (
      <PatternPad key={step} onComplete={onComplete} error={error} />
    );

  const titles = {
    verify: ['Confirm current lock', `Enter your current ${config?.method === 'pattern' ? 'pattern' : 'PIN'} to change it.`],
    enter: ['Set Quick Lock', method === 'pin' ? 'Choose a 4-digit PIN to open WalletZen.' : `Draw an unlock pattern (at least ${MIN_PATTERN_DOTS} dots).`],
    confirm: ['Confirm', method === 'pin' ? 'Enter the same PIN again.' : 'Draw the same pattern again.'],
    biometric: ['Instant access', 'Unlock with your face or fingerprint instead of typing.'],
  };

  return (
    <SecurityShell
      title={titles[step][0]}
      subtitle={titles[step][1]}
      footer={
        changing ? (
          <button type="button" onClick={closeSetup} className="text-ink/55 hover:text-ink">
            Cancel
          </button>
        ) : (
          step !== 'biometric' && (
            <button type="button" onClick={skipSetup} className="text-ink/55 hover:text-ink">
              Skip for now
            </button>
          )
        )
      }
    >
      {step === 'enter' && (
        <SegmentedControl
          options={METHODS}
          value={method}
          onChange={(value) => {
            setMethod(value);
            setMessage(null);
          }}
          size="sm"
          className="w-full"
        />
      )}

      {step === 'verify' && pad(onVerify)}
      {step === 'enter' && pad(onEnter)}
      {step === 'confirm' && pad(onConfirm)}

      {step === 'biometric' && (
        <div className="w-full space-y-4">
          <div className="panel flex items-center gap-3 rounded-2xl border p-4 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zen-lime/15 text-accent">
              <Fingerprint size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Enable {biometricLabel()} for Instant Access</p>
              <p className="text-xs text-ink/55">A shortcut for your {method === 'pin' ? 'PIN' : 'pattern'}, which always works as the backup.</p>
            </div>
            <Toggle checked={bioEnabled} onChange={toggleBiometric} disabled={busy} label={`Enable ${biometricLabel()}`} />
          </div>
          <p className="text-[11px] leading-snug text-ink/45">
            Browsers reach the fingerprint / face sensor through passkeys, so your phone may show it as a passkey (e.g. in
            Google Password Manager) named “WalletZen PIN unlock”. It only unlocks WalletZen on this device and is not your
            Google password.
          </p>
          <Button size="lg" icon={ShieldCheck} className="w-full" loading={busy} onClick={() => finish()}>
            Finish setup
          </Button>
        </div>
      )}

      <p role="alert" className={cx('min-h-5 text-sm', message ? 'text-red-600 dark:text-red-300' : 'text-transparent')}>
        {message ?? '·'}
      </p>
    </SecurityShell>
  );
}
