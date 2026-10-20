import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const META = {
  system: { icon: Monitor, label: 'Theme: system' },
  light: { icon: Sun, label: 'Theme: light' },
  dark: { icon: Moon, label: 'Theme: dark' },
};

/** Cycles System → Light → Dark. */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const { icon: Icon, label } = META[preference];

  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={`${label}. Switch to ${NEXT[preference]}`}
      title={label}
      className="rounded-full bg-ink/10 p-2.5 text-ink/70 transition hover:bg-ink/15 hover:text-ink"
    >
      <Icon size={18} />
    </button>
  );
}
