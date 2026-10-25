import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Cloud, CloudOff, LogIn, Mail, MailCheck, MonitorSmartphone, ScanLine, ShieldCheck, Smartphone, Zap } from 'lucide-react';
import BrandLogo from './BrandLogo';
import Button from './Button';
import Modal from './Modal';
import SegmentedControl from './SegmentedControl';
import { Field, Input } from './FormField';
import { authErrorMessage, toPakistanE164, useAuth } from '../../context/AuthContext';
import { guestItemCount } from '../../services/storageService';

const RESEND_SECONDS = 60;

const METHODS = [
  { value: 'google', label: 'Google' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Mobile' },
];

const REASONS = {
  scan: { icon: ScanLine, text: 'Screenshot scanning saves receipts to your cloud account.' },
  bills: { icon: Zap, text: 'Sign in to fetch your real bill from the official electricity company website.' },
};

/** Counts down from `seconds` each time `startedAt` changes (0 = idle); returns the seconds left. */
function useCountdown(startedAt, seconds = RESEND_SECONDS) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!startedAt) return undefined;
    setLeft(seconds);
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [startedAt, seconds]);
  return left;
}

function GoogleMethod({ setError }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="lg" icon={LogIn} className="w-full" loading={busy} onClick={go}>
      Continue with Google
    </Button>
  );
}

function EmailMethod({ setError }) {
  const { sendEmailLink, completeEmailLink, emailLinkNeedsEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [sentAt, setSentAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(sentAt);

  const run = async (action) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setError(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const send = (e) => {
    e?.preventDefault();
    run(async () => {
      await sendEmailLink(email);
      setSentTo(email.trim());
      setSentAt(Date.now());
    });
  };

  // The link was opened on a different device/browser: confirm the address to finish.
  if (emailLinkNeedsEmail) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => completeEmailLink(email));
        }}
        className="space-y-3"
      >
        <p className="text-sm text-ink/70">Confirm the email address you requested the sign-in link for.</p>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Finish signing in
        </Button>
      </form>
    );
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zen-lime/15 text-accent">
          <MailCheck size={22} />
        </span>
        <div>
          <p className="font-semibold text-ink">Check your inbox</p>
          <p className="mt-1 text-sm text-ink/60">
            We sent a secure sign-in link to <b className="text-ink">{sentTo}</b>. Open it on this device to finish. No password needed.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" loading={busy} disabled={left > 0} onClick={() => send()}>
            {left > 0 ? `Resend link in ${left}s` : 'Resend link'}
          </Button>
          <button type="button" onClick={() => setSentTo(null)} className="inline-flex items-center justify-center gap-1.5 text-xs text-ink/55 hover:text-ink">
            <ArrowLeft size={13} /> Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <Field label="Email address">
        <Input type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Button type="submit" size="lg" icon={Mail} className="w-full" loading={busy}>
        Email me a sign-in link
      </Button>
      <p className="text-center text-[11px] text-ink/40">Passwordless: tap the link we send to sign in securely.</p>
    </form>
  );
}

function PhoneMethod({ setError }) {
  const { sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [sentAt, setSentAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const recaptchaRef = useRef(null);
  const left = useCountdown(sentAt);

  const run = async (action) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setError(error.code ? authErrorMessage(error) : error.message);
    } finally {
      setBusy(false);
    }
  };

  const send = (e) => {
    e?.preventDefault();
    run(async () => {
      toPakistanE164(phone); // validate before touching reCAPTCHA
      // A fresh element per attempt: a reCAPTCHA widget can't be rendered twice into the same node.
      const host = document.createElement('div');
      recaptchaRef.current.replaceChildren(host);
      const result = await sendPhoneOtp(phone, host);
      setConfirmation(result);
      setCode('');
      setSentAt(Date.now());
    });
  };

  const verify = (e) => {
    e.preventDefault();
    run(() => verifyPhoneOtp(confirmation, code));
  };

  return (
    <div className="space-y-3">
      {confirmation ? (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-ink/70">
            Enter the 6-digit code sent to <b className="text-ink">{toPakistanE164(phone)}</b>.
          </p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            aria-label="Verification code"
            autoFocus
            className="text-center text-2xl font-bold tracking-[0.6em]"
          />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
            Verify & sign in
          </Button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => setConfirmation(null)} className="inline-flex items-center gap-1 text-ink/55 hover:text-ink">
              <ArrowLeft size={13} /> Change number
            </button>
            <button type="button" disabled={left > 0 || busy} onClick={() => send()} className="font-medium text-accent disabled:text-ink/40">
              {left > 0 ? `Resend code in ${left}s` : 'Resend code'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={send} className="space-y-3">
          <Field label="Mobile number">
            <div className="flex gap-2">
              <span className="flex shrink-0 items-center rounded-xl border border-ink/10 bg-ink/5 px-3 text-sm font-semibold text-ink/70">🇵🇰 +92</span>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="300 1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="tabular-nums tracking-wide"
              />
            </div>
          </Field>
          <Button type="submit" size="lg" icon={Smartphone} className="w-full" loading={busy}>
            Send SMS code
          </Button>
          <p className="text-center text-[11px] text-ink/40">Protected by reCAPTCHA. Standard SMS rates may apply.</p>
        </form>
      )}
      {/* Host for the invisible reCAPTCHA. */}
      <div ref={recaptchaRef} />
    </div>
  );
}

function LoginBody() {
  const { loginPrompt, canSignIn, emailLinkNeedsEmail } = useAuth();
  const [method, setMethod] = useState(emailLinkNeedsEmail ? 'email' : 'google');
  const [error, setError] = useState(null);
  const pending = guestItemCount();
  const reason = REASONS[loginPrompt?.reason];

  return (
    <div className="space-y-5">
      <div className="text-center">
        <BrandLogo className="mx-auto h-14 w-auto" />
        <h3 className="mt-3 text-xl font-bold text-ink">Login to Unlock Cloud Sync</h3>
        <p className="mt-1 text-sm text-ink/60">You're using WalletZen as a guest, so your data lives only on this device.</p>
      </div>

      <ul className="space-y-2 rounded-xl border border-ink/10 bg-ink/5 p-3 text-sm text-ink/75">
        {reason && (
          <li className="flex items-start gap-2 font-medium text-ink">
            <reason.icon size={16} className="mt-0.5 shrink-0 text-accent" /> {reason.text}
          </li>
        )}
        <li className="flex items-start gap-2">
          <Cloud size={16} className="mt-0.5 shrink-0 text-accent" /> Automatic cloud backup of accounts, bills and transactions
        </li>
        <li className="flex items-start gap-2">
          <MonitorSmartphone size={16} className="mt-0.5 shrink-0 text-accent" /> Same data on your phone, laptop and tablet
        </li>
        <li className="flex items-start gap-2">
          <ScanLine size={16} className="mt-0.5 shrink-0 text-accent" /> Bulk screenshot & receipt scanner
        </li>
      </ul>

      {canSignIn ? (
        <>
          {pending > 0 && (
            <p className="rounded-xl bg-zen-lime/10 px-4 py-2.5 text-xs text-ink/75">
              Your {pending} guest item{pending === 1 ? '' : 's'} will be moved into your account automatically.
            </p>
          )}
          {!emailLinkNeedsEmail && (
            <SegmentedControl
              options={METHODS}
              value={method}
              onChange={(value) => {
                setMethod(value);
                setError(null);
              }}
              size="sm"
            />
          )}
          {method === 'google' && <GoogleMethod setError={setError} />}
          {method === 'email' && <EmailMethod setError={setError} />}
          {method === 'phone' && <PhoneMethod setError={setError} />}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink/40">
            <ShieldCheck size={13} /> Your data syncs privately to your own account.
          </p>
        </>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-ink/5 px-4 py-3 text-xs text-ink/60">
          <CloudOff size={15} className="mt-px shrink-0" />
          <span>
            Cloud sign-in isn't configured in this build. Add your Firebase keys to <code>.env.local</code> to enable Google, email and
            mobile sign-in. Everything keeps working on this device meanwhile.
          </span>
        </p>
      )}
    </div>
  );
}

/** Glassmorphic sign-in sheet: Google, passwordless email link, or Pakistani mobile OTP. */
export default function LoginModal() {
  const { loginPrompt, closeLogin } = useAuth();
  return (
    <Modal open={Boolean(loginPrompt)} onClose={closeLogin} title="Sign in">
      <LoginBody />
    </Modal>
  );
}
