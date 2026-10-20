import { useEffect, useRef, useState } from 'react';
import { CalendarClock, LayoutDashboard, Plus, ReceiptText, WalletCards } from 'lucide-react';
import { cx } from '../../utils/formatters';

export const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: WalletCards },
  { id: 'transactions', label: 'Activity', icon: ReceiptText },
  { id: 'planner', label: 'Planner', icon: CalendarClock },
];

const SCROLL_DELTA = 8; // px of travel before reacting, so small jitters don't flicker the bar
const TOP_ZONE = 80; // always visible near the top of the page

/** Hidden while the user scrolls down through content; shown again on any upward scroll or at the page ends. */
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const atBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
      if (y < TOP_ZONE || atBottom) setHidden(false);
      else if (y - lastY.current > SCROLL_DELTA) setHidden(true);
      else if (lastY.current - y > SCROLL_DELTA) setHidden(false);
      else return; // within the dead zone: keep the reference point
      lastY.current = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    lastY.current = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return hidden;
}

function NavButton({ tab, active, onSelect }) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-medium transition',
        active ? 'text-accent' : 'text-ink/50 hover:text-ink',
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
      {tab.label}
    </button>
  );
}

/** Floating pill navigation with a centered quick-entry button. */
export default function BottomNav({ active, onSelect, onQuickAdd }) {
  const [first, second, third, fourth] = TABS;
  const hidden = useHideOnScroll();
  return (
    <nav
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
        'transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none',
        hidden ? 'pointer-events-none translate-y-[calc(100%+1rem)] opacity-0' : 'translate-y-0 opacity-100',
      )}
    >
      <div className="mx-auto flex max-w-md items-center gap-1 rounded-full border border-ink/10 bg-surface/80 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
        <NavButton tab={first} active={active === first.id} onSelect={onSelect} />
        <NavButton tab={second} active={active === second.id} onSelect={onSelect} />
        <button
          type="button"
          onClick={onQuickAdd}
          aria-label="Add transaction"
          className="-mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zen-lime to-zen-emerald text-zen-950 shadow-lg shadow-zen-lime/30 ring-4 ring-surface transition active:scale-95"
        >
          <Plus size={26} strokeWidth={2.6} />
        </button>
        <NavButton tab={third} active={active === third.id} onSelect={onSelect} />
        <NavButton tab={fourth} active={active === fourth.id} onSelect={onSelect} />
      </div>
    </nav>
  );
}
