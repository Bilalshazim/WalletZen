import { useEffect, useState } from 'react';
import { Fingerprint, Lock, LockOpen } from 'lucide-react';
import Button from '../common/Button';
import { useLock } from '../../context/LockContext';
import { biometricLabel, isBiometricAvailable } from '../../services/quickLock';
import { cx } from '../../utils/formatters';

/** Settings section: set up / change / remove Quick Lock and switch biometrics on or off. */
export default function QuickLockSettings({ onNavigate }) {
  const { config, openSetup, disableLock, toggleBiometric } = useLock();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const enabled = Boolean(config?.hash);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  const setup = () => {
    onNavigate?.();
    openSetup();
  };

  const remove = () => {
    if (window.confirm('Turn off Quick Lock? WalletZen will open without a PIN, pattern or biometrics.')) disableLock();
  };

  const switchBiometric = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await toggleBiometric(!config.biometric);
    } catch (err) {
      setMessage(err.name === 'NotAllowedError' ? 'Cancelled.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-ink/10 p-4">
      <div className="flex items-center gap-3">
        <span className={cx('flex h-10 w-10 items-center justify-center rounded-full', enabled ? 'bg-zen-lime/15 text-accent' : 'bg-ink/10 text-ink/50')}>
          {enabled ? <Lock size={18} /> : <LockOpen size={18} />}
        </span>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-semibold text-ink">Quick Lock</p>
          <p className="text-xs text-ink/55">
            {enabled
              ? `${config.method === 'pattern' ? 'Pattern' : '4-digit PIN'}${config.biometric ? ` + ${biometricLabel()}` : ''} · locks after 30 s in background`
              : 'Off. Anyone with this device can open the app'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={enabled ? 'secondary' : 'primary'} onClick={setup}>
          {enabled ? 'Change PIN / pattern' : 'Set up Quick Lock'}
        </Button>
        {enabled && bioAvailable && (
          <Button size="sm" variant="secondary" icon={Fingerprint} loading={busy} onClick={switchBiometric}>
            {config.biometric ? `Turn off ${biometricLabel()}` : `Enable ${biometricLabel()}`}
          </Button>
        )}
        {enabled && (
          <Button size="sm" variant="ghost" onClick={remove}>
            Turn off
          </Button>
        )}
      </div>
      {message && <p className="text-xs text-red-600 dark:text-red-300">{message}</p>}
    </section>
  );
}
