import { useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { cx } from '../../utils/formatters';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', 'del'];

/**
 * 4-digit PIN entry with on-screen keypad (and physical keyboard). Calls onComplete(pin) at 4 digits, then
 * clears itself. `error` (a counter — each new value replays the shake) marks a wrong PIN; `disabled` blocks input.
 */
export default function PinPad({ onComplete, error, disabled = false, label = 'Enter PIN' }) {
  const [pin, setPinState] = useState('');
  // Mirror for handlers so completion fires exactly once (never from inside a state updater).
  const pinRef = useRef('');
  const setPin = (value) => {
    pinRef.current = value;
    setPinState(value);
  };

  const press = (key) => {
    if (disabled) return;
    if (key === 'del') return setPin(pinRef.current.slice(0, -1));
    if (pinRef.current.length >= PIN_LENGTH) return;
    const next = pinRef.current + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      // Let the last dot render before handing off.
      setTimeout(() => {
        onComplete(next);
        setPin('');
      }, 120);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        key={error || 'ok'}
        role="status"
        aria-label={`${label}: ${pin.length} of ${PIN_LENGTH} digits entered`}
        className={cx('flex gap-4', error && 'animate-shake')}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cx(
              'h-3.5 w-3.5 rounded-full border-2 transition',
              i < pin.length ? 'border-zen-emerald bg-zen-emerald' : error ? 'border-red-400' : 'border-ink/30',
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) =>
          key === null ? (
            <span key="blank" aria-hidden="true" />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={disabled}
              aria-label={key === 'del' ? 'Delete digit' : key}
              className={cx(
                'flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold transition active:scale-95 disabled:opacity-40',
                key === 'del' ? 'text-ink/60 hover:text-ink' : 'border border-ink/10 bg-ink/5 text-ink hover:bg-ink/10',
              )}
            >
              {key === 'del' ? <Delete size={22} /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
