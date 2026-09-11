import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  IconGrid, IconUsers, IconFile, IconWallet, IconWrench, IconChart,
  IconCog, IconShield, IconKey, IconHome, IconLogout, IconBuilding, IconCalendar,
} from './icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import SubscriptionBanner from './SubscriptionBanner.jsx';

// Nav is a mix of flat links and grouped links. A group expands into a hover
// flyout on the rail; `primary` marks what also appears in the mobile bottom
// bar, and a group carries a `mobileTo` for that tab's single destination.
const navItems = [
  { to: '/', label: 'Dashboard', end: true, icon: IconGrid, primary: true },
  { label: 'People', icon: IconUsers, primary: true, mobileTo: '/tenants', children: [
    { to: '/tenants', label: 'Tenants', icon: IconUsers },
    { to: '/staff', label: 'Staff', icon: IconShield },
  ] },
  { label: 'Property', icon: IconHome, primary: true, mobileTo: '/properties', children: [
    { to: '/properties', label: 'Properties', icon: IconHome },
    { to: '/units', label: 'Units', icon: IconBuilding },
  ] },
  { label: 'Leasing', icon: IconWallet, primary: true, mobileTo: '/payments', children: [
    { to: '/leases', label: 'Leases', icon: IconFile },
    { to: '/payments', label: 'Payments', icon: IconWallet },
  ] },
  { label: 'Operations', icon: IconWrench, mobileTo: '/faults-renovations', children: [
    { to: '/access', label: 'Access Cards', icon: IconKey },
    { to: '/faults-renovations', label: 'Costs & Repairs', icon: IconWrench },
    { to: '/booking-requests', label: 'Booking Requests', icon: IconCalendar },
  ] },
  { to: '/reports', label: 'Reports', icon: IconChart, primary: true },
  { to: '/settings', label: 'Settings', icon: IconCog },
];
const platformAdminItems = [{ to: '/admin', label: 'Subscribers', icon: IconChart }];

const TITLES = {
  '/': 'Portfolio Overview', '/tenants': 'Tenants', '/tenants/onboard': 'Onboard Tenant',
  '/properties': 'Properties', '/properties/onboard': 'Add Property', '/units': 'Units',
  '/units/onboard': 'Add Apartment', '/leases': 'Leases', '/access': 'Access Cards',
  '/payments': 'Payments', '/faults-renovations': 'Costs, Faults & Renovations',
  '/booking-requests': 'Booking Requests', '/reports': 'Reports', '/staff': 'Staff & Access',
  '/settings': 'Settings', '/admin': 'Lintel Subscribers',
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
  const { user, logout, isPlatformAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sheet, setSheet] = useState(null); // grouped nav item shown in the mobile sheet
  const visibleNav = isPlatformAdmin ? [...navItems, ...platformAdminItems] : navItems;

  const initials = user
    ? `${user.name.split(' ')[0]?.[0] || ''}${user.name.split(' ')[1]?.[0] || ''}`.toUpperCase() || user.name[0]?.toUpperCase()
    : 'LM';
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="min-h-screen text-ink">
      {/* Ambient interior photo + scrim behind the whole shell. */}
      <div className="lx-app-bg" style={{ backgroundImage: 'url(/app-bg.jpg)' }} aria-hidden="true" />
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
        <header className="sticky top-0 z-20">
          <div className="lx-glass border-x-0 border-t-0">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="md:hidden w-8 h-8 rounded-lg text-white font-serif text-sm flex items-center justify-center shrink-0"
                     style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}>L</div>
                <div className="min-w-0">
                  <div className="lx-eyebrow hidden sm:block">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                  <h1 className="font-serif text-lg sm:text-xl text-ink leading-tight truncate">{pageTitle(location.pathname, visibleNav)}</h1>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 lx-glass border-x-0 border-b-0 flex items-stretch">
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
