import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconGrid, IconChart, IconLogout } from './icons.jsx';
import { PATH_PERM, ROLE_ACCENT, resolveWallpaper, roleApps } from '../config/apps.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import SubscriptionBanner from './SubscriptionBanner.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import QuickAdd from './QuickAdd.jsx';
import CommandPalette from './CommandPalette.jsx';
import Desktop from './Desktop.jsx';
import AppWindow from './AppWindow.jsx';
import Dock from './Dock.jsx';

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Window/app titles. TITLES covers exact paths; each role overrides a few.
const TITLES = {
  '/overview': 'Overview', '/tenants': 'Residents', '/tenants/onboard': 'Add a resident',
  '/properties': 'Buildings', '/properties/onboard': 'Add a building', '/units': 'Apartments',
  '/units/onboard': 'Add an apartment', '/leases': 'Tenancies', '/access': 'Access cards',
  '/payments': 'Payments', '/faults-renovations': 'Repairs',
  '/booking-requests': 'Enquiries', '/reports': 'Reports', '/staff': 'Your team',
  '/settings': 'Settings', '/admin': 'Lintel Subscribers',
  '/reservations': 'Reservations', '/rooms': 'Rooms', '/housekeeping': 'Housekeeping',
};
const TITLE_OVERRIDES = {
  hotelier: { '/tenants': 'Guests', '/tenants/onboard': 'Add a guest' },
  shortlet: {
    '/tenants': 'Guests', '/tenants/onboard': 'Add a guest',
    '/reservations': 'Calendar', '/rooms': 'Listings',
    '/units/onboard': 'Add a listing', '/payments': 'Payouts',
  },
  agent: {
    '/tenants': 'Contacts', '/tenants/onboard': 'Add a contact',
    '/units': 'Listings for sale', '/units/onboard': 'Add a listing',
    '/properties': 'Developments', '/booking-requests': 'Enquiries',
  },
};
const ROLE_LABEL = { manager: 'Admin', finance: 'Member', viewer: 'Member' };

function SunIcon(p) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>); }
function MoonIcon(p) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8" /></svg>); }

const OPEN_KEY = 'lintel_open_apps';
const loadOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { return []; } };
const saveOpen = (a) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(a.slice(0, 12))); } catch { /* storage may be unavailable */ } };

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformAdmin, role, can } = useAuth();
  const { theme, toggleTheme, applyCompanyDefault } = useTheme();
  const { settings } = useSettings();
  const [openApps, setOpenApps] = useState(loadOpen);
  const [maximized, setMaximized] = useState(false);

  // Accent token, app-wide (org brand colour first, else the role's identity).
  useEffect(() => {
    const root = document.documentElement;
    const org = settings?.accent_color;
    const accent = (org && /^#[0-9a-fA-F]{6}$/.test(org)) ? org : ROLE_ACCENT[role];
    if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
      root.style.setProperty('--color-gold', accent);
      root.style.setProperty('--color-gold-light', lighten(accent, 0.25));
    } else {
      root.style.removeProperty('--color-gold');
      root.style.removeProperty('--color-gold-light');
    }
  }, [settings?.accent_color, role]);

  useEffect(() => {
    if (settings?.default_theme) applyCompanyDefault(settings.default_theme);
  }, [settings?.default_theme, applyCompanyDefault]);

  // The role's launchable apps (permission-filtered) — for titles, icons and the
  // dock. Overview (the dashboard) and, for the operator, Subscribers are added.
  const apps = useMemo(() => {
    const list = [
      { to: '/overview', label: 'Overview', icon: IconGrid },
      ...roleApps(role).filter((a) => !a.perm || can(a.perm)),
    ];
    if (isPlatformAdmin) list.push({ to: '/admin', label: 'Subscribers', icon: IconChart });
    return list.sort((a, b) => b.to.length - a.to.length);
  }, [role, can, isPlatformAdmin]);

  const matchApp = useCallback((p) => apps.find((a) => p === a.to || p.startsWith(a.to + '/')), [apps]);
  const appRoot = useCallback((p) => (matchApp(p)?.to) || p, [matchApp]);
  const iconForPath = useCallback((p) => matchApp(p)?.icon || IconGrid, [matchApp]);
  const overrides = TITLE_OVERRIDES[role] || {};
  const titleFor = useCallback((p) => overrides[p] || TITLES[p] || matchApp(p)?.label || 'Lintel', [overrides, matchApp]);

  const isDesktop = location.pathname === '/';
  const current = isDesktop ? null : appRoot(location.pathname);

  // Track open apps as you move between them (one chip per app, across sub-routes).
  useEffect(() => {
    if (location.pathname === '/') return;
    const rootA = appRoot(location.pathname);
    setOpenApps((prev) => {
      const next = [rootA, ...prev.filter((x) => x !== rootA)].slice(0, 12);
      saveOpen(next);
      return next;
    });
    setMaximized(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const closeApp = (rootA) => {
    setOpenApps((prev) => { const n = prev.filter((x) => x !== rootA); saveOpen(n); return n; });
    if (current === rootA) navigate('/');
  };

  const initials = user
    ? `${user.name.split(' ')[0]?.[0] || ''}${user.name.split(' ')[1]?.[0] || ''}`.toUpperCase() || user.name[0]?.toUpperCase()
    : 'LM';
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen text-ink">
      {/* Wallpaper + scrim behind the whole OS. */}
      <div className="lx-app-bg" style={{ backgroundImage: `url(${resolveWallpaper(settings, role)})` }} aria-hidden="true" />
      <div className="lx-app-scrim" aria-hidden="true" />

      {/* Slim menu/status bar — wordmark + system tray. */}
      <header className="relative z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2.5 min-w-0 group" title="Home">
            <span className="w-8 h-8 rounded-xl text-white font-serif text-sm flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(160deg,#cf9e5c,#a9793a)' }}>L</span>
            <span className="min-w-0 text-left hidden sm:block">
              <span className="block font-serif text-ink leading-none">Lintel</span>
              <span className="block text-[10px] text-stone leading-none mt-0.5">{dateStr}</span>
            </span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <QuickAdd />
            <CommandPalette />
            <NotificationsBell />
            <button type="button" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'} aria-label="Toggle theme" className="lx-icon-btn">
              {theme === 'dark' ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
            </button>
            <div className="flex items-center gap-2.5 lx-glass rounded-full pl-1 pr-1.5 py-1">
              <span className="w-8 h-8 rounded-full bg-panel border border-line flex items-center justify-center text-xs font-semibold text-ink shrink-0">{initials}</span>
              <div className="min-w-0 hidden sm:block leading-tight pr-1">
                <div className="text-xs font-medium text-ink truncate max-w-[120px]">{user?.name || 'Lintel'}</div>
                <div className="text-[10px] text-stone">{user ? ROLE_LABEL[user.role] : ''}</div>
              </div>
              <button onClick={handleLogout} title="Sign out" className="w-7 h-7 rounded-lg flex items-center justify-center text-stone hover:text-ink hover:bg-panel shrink-0">
                <IconLogout width={14} height={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop (home) or an open app window. */}
      <main className="relative z-10 pb-28">
        {isDesktop ? (
          <div key="desktop">{children}</div>
        ) : (
          <AppWindow
            title={titleFor(location.pathname)}
            Icon={iconForPath(location.pathname)}
            maximized={maximized}
            onMinimize={() => navigate('/')}
            onToggleMax={() => setMaximized((m) => !m)}
            onClose={() => closeApp(current)}
          >
            <SubscriptionBanner />
            {children}
          </AppWindow>
        )}
      </main>

      <Dock
        openApps={openApps.filter((p) => matchApp(p))}
        current={current}
        titleFor={titleFor}
        iconForPath={iconForPath}
        onHome={() => navigate('/')}
        onOpen={(p) => navigate(p)}
        onClose={closeApp}
      />
    </div>
  );
}
