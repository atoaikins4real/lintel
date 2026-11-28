import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconChart, IconLogout } from './icons.jsx';
import { NAV_BY_ROLE, PATH_PERM, ROLE_ACCENT, resolveWallpaper } from '../config/apps.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import SubscriptionBanner from './SubscriptionBanner.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import QuickAdd from './QuickAdd.jsx';
import CommandPalette from './CommandPalette.jsx';

// Lighten a hex colour toward white by `amt` (0–1) — used to derive the lighter
// accent shade from the one branding colour a workspace picks.
function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Nav, per-role module catalog and the permission each route needs all live in
// one place now — src/config/apps.js — so the rail, the home app-launcher, the
// ⌘K palette and the + quick-add menu stay in lock-step. This shell only lays
// them out. `primary` marks what also appears in the mobile bottom bar; a group
// carries a `mobileTo` for that tab's single destination.
const platformAdminItems = [{ to: '/admin', label: 'Subscribers', icon: IconChart }];

const TITLES = {
  '/': 'Home', '/tenants': 'Residents', '/tenants/onboard': 'Add a resident',
  '/properties': 'Buildings', '/properties/onboard': 'Add a building', '/units': 'Apartments',
  '/units/onboard': 'Add an apartment', '/leases': 'Tenancies', '/access': 'Access cards',
  '/payments': 'Payments', '/faults-renovations': 'Repairs',
  '/booking-requests': 'Enquiries', '/reports': 'Reports', '/staff': 'Your team',
  '/settings': 'Settings', '/admin': 'Lintel Subscribers',
  '/reservations': 'Reservations', '/rooms': 'Rooms', '/housekeeping': 'Housekeeping',
};
// Titles that read differently per role. Each role's map overrides the shared
// TITLES above for the paths where its wording differs.
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

const flattenForTitle = (items) => items.flatMap((n) => (n.children ? n.children : [n]));
function pageTitle(pathname, items) {
  if (TITLES[pathname]) return TITLES[pathname];
  const section = flattenForTitle(items).find((n) => n.to && n.to !== '/' && pathname.startsWith(n.to));
  return section ? section.label : 'Lintel';
}
const childActiveFor = (item, pathname) => item.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'));

function SunIcon(p) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>); }
function MoonIcon(p) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8"/></svg>); }

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformAdmin, role, can } = useAuth();
  const { theme, toggleTheme, applyCompanyDefault } = useTheme();
  const { settings } = useSettings();
  const [sheet, setSheet] = useState(null); // grouped nav item shown in the mobile sheet

  // Accent token, app-wide. Priority: the organisation's own brand colour
  // (Settings → branding) first — that's how a subscriber brands their
  // workspace — otherwise the role's identity colour, so each vertical looks
  // distinct out of the box. Only a plain default if neither applies.
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

  // Apply the workspace's default theme for viewers who haven't chosen one.
  useEffect(() => {
    if (settings?.default_theme) applyCompanyDefault(settings.default_theme);
  }, [settings?.default_theme, applyCompanyDefault]);

  // Modules the workspace has chosen to hide from its navigation. Home and
  // Settings can never be hidden.
  const hidden = useMemo(() => new Set(settings?.hidden_features || []), [settings?.hidden_features]);
  // Hide anything this worker's role can't access: drop permitted-out children,
  // then drop groups left with none and flat links they can't see.
  const permitted = (it) => !it.to || !PATH_PERM[it.to] || can(PATH_PERM[it.to]);
  const roleNav = (NAV_BY_ROLE[role] || NAV_BY_ROLE.landlord)
    .map((it) => (it.children ? { ...it, children: it.children.filter(permitted) } : it))
    .filter((it) => (it.children ? it.children.length > 0 : permitted(it)));
  const baseNav = roleNav.filter(
    (it) => it.label === 'Home' || it.label === 'Settings' || !hidden.has(it.label)
  );
  const visibleNav = isPlatformAdmin ? [...baseNav, ...platformAdminItems] : baseNav;
  const overrides = TITLE_OVERRIDES[role] || {};
  const titleFor = (pathname) => overrides[pathname] || pageTitle(pathname, visibleNav);

  const initials = user
    ? `${user.name.split(' ')[0]?.[0] || ''}${user.name.split(' ')[1]?.[0] || ''}`.toUpperCase() || user.name[0]?.toUpperCase()
    : 'LM';
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="min-h-screen text-ink">
      {/* Ambient interior photo + scrim behind the whole shell. */}
      <div className="lx-app-bg" style={{ backgroundImage: `url(${resolveWallpaper(settings, role)})` }} aria-hidden="true" />
      <div className="lx-app-scrim" aria-hidden="true" />

      {/* Floating rail — left-aligned, vertically centered (desktop + tablet). */}
      <aside className="hidden md:flex fixed left-3 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-1
                        lx-glass rounded-[22px] p-2 shadow-lift max-h-[92vh] overflow-y-auto">
        <div className="w-10 h-10 rounded-xl text-white font-serif flex items-center justify-center mb-1 shrink-0"
             style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }} title="Lintel">L</div>
        {visibleNav.map((item) =>
          item.children ? (
            <RailGroup key={item.label} item={item} pathname={location.pathname} />
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} title={item.label}
              className={({ isActive }) =>
                `w-10 h-10 rounded-xl flex items-center justify-center transition ${
                  isActive ? 'bg-ink text-canvas' : 'text-stone hover:text-ink hover:bg-panel'
                }`
              }>
              <item.icon width={18} height={18} />
            </NavLink>
          )
        )}
      </aside>

      {/* Main column, offset to clear the floating rail on desktop. */}
      <div className="relative z-10 flex flex-col min-h-screen md:pl-[84px]">
        <header className="sticky top-0 z-30">
          <div className="lx-topbar">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="md:hidden w-8 h-8 rounded-lg text-white font-serif text-sm flex items-center justify-center shrink-0"
                     style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}>L</div>
                <div className="min-w-0">
                  <div className="lx-eyebrow hidden sm:block">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                  <h1 className="font-serif text-lg sm:text-xl text-ink leading-tight truncate">{titleFor(location.pathname)}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <QuickAdd />
                <CommandPalette />
                <NotificationsBell />
                <button type="button" onClick={toggleTheme}
                  title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                  aria-label="Toggle theme" className="lx-icon-btn">
                  {theme === 'dark' ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
                </button>
                <div className="flex items-center gap-2.5 lx-glass rounded-full pl-1 pr-1.5 py-1">
                  <span className="w-8 h-8 rounded-full bg-panel border border-line flex items-center justify-center text-xs font-semibold text-ink shrink-0">{initials}</span>
                  <div className="min-w-0 hidden sm:block leading-tight pr-1">
                    <div className="text-xs font-medium text-ink truncate max-w-[120px]">{user?.name || 'Lintel Manager'}</div>
                    <div className="text-[10px] text-stone">{user ? ROLE_LABEL[user.role] : ''}</div>
                  </div>
                  <button onClick={handleLogout} title="Sign out" className="w-7 h-7 rounded-lg flex items-center justify-center text-stone hover:text-ink hover:bg-panel shrink-0">
                    <IconLogout width={14} height={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <SubscriptionBanner />
            <div key={location.pathname} className="lx-page">{children}</div>
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar — mirrors the desktop rail: every top-level
          section is present. Grouped sections open a sheet with their pages. */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 lx-bottombar flex items-stretch">
        {visibleNav.map((item) =>
          item.children ? (
            <button key={item.label} type="button" onClick={() => setSheet(item)}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2.5 text-[9px] font-medium transition ${
                childActiveFor(item, location.pathname) ? 'text-gold' : 'text-stone'
              }`}>
              <item.icon width={18} height={18} />
              <span className="leading-none truncate max-w-full px-0.5">{item.label}</span>
            </button>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2.5 text-[9px] font-medium transition ${
                  isActive ? 'text-gold' : 'text-stone'
                }`
              }>
              <item.icon width={18} height={18} />
              <span className="leading-none truncate max-w-full px-0.5">{item.label.split(' ')[0]}</span>
            </NavLink>
          )
        )}
      </nav>

      {/* Mobile section sheet: lists the pages inside a grouped nav item. */}
      {sheet && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setSheet(null)}>
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
          <div className="absolute bottom-0 inset-x-0 lx-glass border-x-0 border-b-0 rounded-t-2xl p-3 pb-7"
               onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone/40" />
            <div className="lx-eyebrow px-2 pb-1">{sheet.label}</div>
            <div className="grid grid-cols-1 gap-1">
              {sheet.children.map((c) => (
                <NavLink key={c.to} to={c.to} onClick={() => setSheet(null)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition ${
                      isActive ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-panel'
                    }`
                  }>
                  <c.icon width={18} height={18} />
                  {c.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rail group: icon with a hover flyout listing its members to the right.
function RailGroup({ item, pathname }) {
  const active = childActiveFor(item, pathname);
  const Icon = item.icon;
  return (
    <div className="relative group w-full flex justify-center">
      <NavLink to={item.mobileTo} title={item.label}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
          active ? 'bg-ink text-canvas' : 'text-stone group-hover:text-ink hover:bg-panel'
        }`}>
        <Icon width={18} height={18} />
      </NavLink>
      <div className="absolute left-full top-0 pl-3 hidden group-hover:block z-40">
        <div className="lx-glass rounded-xl shadow-lift py-1.5 min-w-[168px]">
          <div className="lx-eyebrow px-3 py-1">{item.label}</div>
          {item.children.map((c) => (
            <NavLink key={c.to} to={c.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-sm transition ${
                  isActive ? 'text-ink font-medium bg-panel' : 'text-stone hover:bg-panel hover:text-ink'
                }`
              }>
              <c.icon width={15} height={15} />
              {c.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
