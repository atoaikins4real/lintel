import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, storeToken, clearToken, getMe, login as apiLogin, setOnUnauthorized } from '../api/client.js';
import { resolveRole, isStayRole } from '../config/roles.js';

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

  // Operator of Lintel itself — separate from any role inside a company.
  const isPlatformAdmin = user?.is_platform_admin === true;
  // Godmode (platform admin) has full access to every page and feature, so it
  // counts as both an editor and an Admin everywhere in the UI, whatever its
  // in-company role happens to be. The backend enforces the same override.
  const canEdit = isPlatformAdmin || (user ? ['manager', 'finance'].includes(user.role) : false);
  const isManager = isPlatformAdmin || user?.role === 'manager';
  // The business role chosen at sign-up (landlord | hotelier | shortlet |
  // agent), resolved from the company's stored business_type. Everything that
  // changes per role — the navigation, the home dashboard, the wording — reads
  // this. `isHotel` stays true for any stay/booking role (hotel + short-let),
  // which is what drives the rooms/reservations side.
  const role = resolveRole(company?.business_type);
  const isHotel = isStayRole(role);

  // Fine-grained permissions for workers. Managers and the Lintel operator can
  // do everything; a member can do exactly what their assigned role allows
  // (server-computed, delivered on login and /me).
  const permissions = user?.permissions || [];
  const can = useCallback(
    (key) => isPlatformAdmin || user?.role === 'manager' || permissions.includes(key),
    [isPlatformAdmin, user?.role, permissions]
  );

  const value = useMemo(
    () => ({ user, company, setCompany, loading, login, logout, setSession, canEdit, isManager, isPlatformAdmin, role, isHotel, permissions, can }),
    [user, company, loading, login, logout, setSession, canEdit, isManager, isPlatformAdmin, role, isHotel, permissions, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
