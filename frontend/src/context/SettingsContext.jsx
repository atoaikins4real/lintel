import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSettings } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { formatMoney } from '../utils/currency.js';

const SettingsContext = createContext(null);

// Loads the account's settings once a user is signed in, and exposes a
// `money()` helper so pages never hardcode a currency symbol.
export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);

  const refresh = useCallback(() => {
    if (!user) return Promise.resolve(null);
    return getSettings()
      .then((s) => {
        setSettings(s);
        return s;
      })
      .catch(() => null); // Non-fatal: fall back to the GHS default below.
  }, [user]);

  useEffect(() => {
    if (user) refresh();
    else setSettings(null);
  }, [user, refresh]);

  const currency = settings?.default_currency || 'GHS';

  const value = useMemo(
    () => ({
      settings,
      refresh,
      setSettings,
      currency,
      // money(1200) -> account default currency
      // money(1200, 'USD') -> that payment's own currency
      money: (amount, overrideCurrency, opts) => formatMoney(amount, overrideCurrency || currency, opts),
    }),
    [settings, refresh, currency]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
