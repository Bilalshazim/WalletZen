import { useRef, useState } from 'react';
import { cx } from '../../utils/formatters';

export const MIN_PATTERN_DOTS = 4;
const SIZE = 240; // px, square drawing area
const CELL = SIZE / 3;
const center = (dot) => ({ x: (dot % 3) * CELL + CELL / 2, y: Math.floor(dot / 3) * CELL + CELL / 2 });

/**
 * 3×3 pattern lock. Drag through dots with touch/mouse/pen; releasing calls onComplete(dots) when at least
 * 4 dots were joined. Dots are also focusable buttons, so keyboard users can enter the pattern with Tab + Enter.
 */
export default function PatternPad({ onComplete, error, disabled = false }) {
  const [dots, setDotsState] = useState([]);
  // Mirror of `dots` for event handlers, so completion never runs inside a state updater.
  const dotsRef = useRef([]);
  const setDots = (next) => {
    dotsRef.current = next;
    setDotsState(next);
  };
  const [pointer, setPointer] = useState(null);
  const drawing = useRef(false);
  const svgRef = useRef(null);
  const tapTimer = useRef(null);

  const local = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  };
  const dotAt = ({ x, y }) => {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (col < 0 || col > 2 || row < 0 || row > 2) return null;
    const dot = row * 3 + col;
    const c = center(dot);
    return Math.hypot(c.x - x, c.y - y) < CELL * 0.38 ? dot : null;
  };
  const add = (dot) => {
    if (dot !== null && !dotsRef.current.includes(dot)) setDots([...dotsRef.current, dot]);
  };

  const finish = (sequence) => {
    drawing.current = false;
    setPointer(null);
    if (sequence.length >= MIN_PATTERN_DOTS) onComplete(sequence);
    else if (sequence.length) onComplete(sequence, { tooShort: true });
    setTimeout(() => setDots([]), 250);
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    setDots([]);
    add(dotAt(local(e)));
  };
  const onPointerMove = (e) => {
    if (!drawing.current) return;
    const p = local(e);
    setPointer(p);
    add(dotAt(p));
  };
  const onPointerUp = () => {
    if (drawing.current) finish(dotsRef.current);
  };

  // Keyboard fallback (Tab + Enter on dots): pausing 1.2 s after the last dot submits the pattern.
  const tap = (dot) => {
    if (disabled || drawing.current) return;
    add(dot);
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => finish(dotsRef.current), 1200);
  };

  const points = dots.map(center);
  const last = points[points.length - 1];

  return (
    <div key={error || 'ok'} className={cx('relative select-none', error && 'animate-shake')} style={{ width: SIZE, height: SIZE }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
      >
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={error ? 'rgb(248 113 113)' : '#10B981'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {last && pointer && (
          <line x1={last.x} y1={last.y} x2={pointer.x} y2={pointer.y} stroke="#10B981" strokeOpacity="0.5" strokeWidth="4" strokeLinecap="round" />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid grid-cols-3">
        {Array.from({ length: 9 }, (_, dot) => {
          const active = dots.includes(dot);
          return (
            <div key={dot} className="flex items-center justify-center">
              <button
                type="button"
                tabIndex={0}
                aria-label={`Dot ${dot + 1}${active ? ', selected' : ''}`}
                onClick={() => tap(dot)}
                disabled={disabled}
                className={cx(
                  // Pointer input goes to the drawing layer underneath; these buttons serve keyboard users.
                  'h-5 w-5 rounded-full border-2 transition',
                  active ? 'scale-125 border-zen-emerald bg-zen-emerald' : error ? 'border-red-400' : 'border-ink/35 bg-ink/10',
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
