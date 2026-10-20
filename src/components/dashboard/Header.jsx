import { Cloud, CloudOff, LogOut, Settings } from 'lucide-react';
import BrandLogo from '../common/BrandLogo';
import ThemeToggle from '../common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';
import { greeting } from '../../utils/formatters';

const iconButton = 'rounded-full bg-ink/10 p-2.5 text-ink/70 transition hover:bg-ink/15 hover:text-ink';

export default function Header({ onOpenSettings }) {
  const { user, isGuest, canSignIn, openLogin, signOut } = useAuth();
  const name = user.displayName?.split(' ')[0] ?? 'there';
  const account = user.email ?? user.phoneNumber;

  return (
    <header className="flex items-center gap-3">
      <BrandLogo className="h-10 w-auto shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink/50">{greeting()},</p>
        <h1 className="truncate text-lg font-semibold text-ink">{name}</h1>
      </div>

      {isGuest ? (
        // Guest badge doubles as the sign-in entry point.
        <button
          type="button"
          onClick={openLogin}
          title={canSignIn ? 'Guest Mode — tap to sign in and enable cloud sync' : 'Guest Mode — data stays on this device'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-400/20 dark:text-amber-300"
        >
          <CloudOff size={13} />
          <span className="hidden sm:inline">Guest Mode (Sync Disabled)</span>
          <span className="sm:hidden">Guest</span>
        </button>
      ) : (
        <span
          title={`Synced · ${account ?? ''}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zen-lime/25 bg-zen-lime/10 p-2 text-[11px] font-medium text-accent sm:px-3 sm:py-1.5"
        >
          <Cloud size={13} />
          <span className="hidden sm:inline">Synced</span>
        </span>
      )}

      <ThemeToggle />
      <button type="button" onClick={onOpenSettings} aria-label="Settings" className={iconButton}>
        <Settings size={18} />
      </button>
      {!isGuest && (
        <>
          {user.photoURL && (
            <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="hidden h-10 w-10 rounded-full border border-ink/10 object-cover sm:block" />
          )}
          <button type="button" onClick={signOut} aria-label="Sign out" title={`Sign out ${account ?? ''}`} className={iconButton}>
            <LogOut size={18} />
          </button>
        </>
      )}
    </header>
  );
}
