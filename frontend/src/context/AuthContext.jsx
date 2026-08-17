import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, storeToken, clearToken, getMe, login as apiLogin, setOnUnauthorized } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setCompany(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(logout);
  }, [logout]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((res) => {
        setUser(res.user);
        setCompany(res.company || null);
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (email, password, remember = true) => {
    const res = await apiLogin({ email, password });
    storeToken(res.token, remember);
    setUser(res.user);
    setCompany(res.company || null);
    return res.user;
  }, []);

  const setSession = useCallback((token, sessionUser, remember = true, sessionCompany = null) => {
    storeToken(token, remember);
    setUser(sessionUser);
    if (sessionCompany) setCompany(sessionCompany);
  }, []);

  const canEdit = user ? ['manager', 'finance'].includes(user.role) : false;
  const isManager = user?.role === 'manager';
  // Operator of Lintel itself — separate from any role inside a company.
  const isPlatformAdmin = user?.is_platform_admin === true;

  const value = useMemo(
    () => ({ user, company, setCompany, loading, login, logout, setSession, canEdit, isManager, isPlatformAdmin }),
    [user, company, loading, login, logout, setSession, canEdit, isManager, isPlatformAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
