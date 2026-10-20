import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { FOREIGN_CURRENCIES } from '../utils/constants';

const SettingsContext = createContext(null);

// Device-only preferences (currency rates).
const STORAGE_KEY = 'walletzen:settings';
const DEFAULT_RATES = Object.fromEntries(Object.entries(FOREIGN_CURRENCIES).map(([code, c]) => [code, c.defaultRate]));
const DEFAULTS = { rates: DEFAULT_RATES };

const load = () => {
  try {
    const { usdRate, rates, geminiApiKey, geminiModel, ...saved } = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    // Older versions stored a single `usdRate` and a per-device Gemini key; the key now comes from the build env.
    const next = { ...DEFAULTS, ...saved, rates: { ...DEFAULT_RATES, ...(usdRate && { USD: usdRate }), ...rates } };
    if (geminiApiKey !== undefined || geminiModel !== undefined) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return DEFAULTS;
  }
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: settings still apply for this session.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...settings, updateSettings }), [settings, updateSettings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>');
  return context;
}
