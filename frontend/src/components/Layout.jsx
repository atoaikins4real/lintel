import { useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  IconGrid, IconUsers, IconBuilding, IconFile, IconWallet, IconWrench, IconChart,
  IconCalendar, IconCog, IconShield, IconKey, IconHome, IconLogout, IconChevron,
} from './icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import SubscriptionBanner from './SubscriptionBanner.jsx';

// Nav is a mix of flat links and grouped links. A group (e.g. "Property")
// has `children` and no `to` of its own — it expands on hover to reveal its
// members. `primary` marks what also appears in the mobile bottom tab bar
// (which only fits ~five before labels become unreadable); a group carries a
// `mobileTo` so the bar has a single destination to point that tab at.
const navItems = [
  { to: '/', label: 'Dashboard', end: true, icon: IconGrid, primary: true },
  {
    label: 'People',
    icon: IconUsers,
    primary: true,
    mobileTo: '/tenants',
    children: [
      { to: '/tenants', label: 'Tenants', icon: IconUsers },
      { to: '/staff', label: 'Staff', icon: IconShield },
    ],
  },
  {
    label: 'Property',
    icon: IconHome,
    primary: true,
    mobileTo: '/properties',
    children: [
      { to: '/properties', label: 'Properties', icon: IconHome },
      { to: '/units', label: 'Units', icon: IconBuilding },
    ],
  },
  {
    label: 'Leasing',
    icon: IconWallet,
    primary: true,
    mobileTo: '/payments',
    children: [
      { to: '/leases', label: 'Leases', icon: IconFile },
      { to: '/payments', label: 'Payments', icon: IconWallet },
    ],
  },
  {
    label: 'Operations',
    icon: IconWrench,
    mobileTo: '/faults-renovations',
    children: [
      { to: '/access', label: 'Access Cards', icon: IconKey },
      { to: '/faults-renovations', label: 'Costs & Repairs', icon: IconWrench },
      { to: '/booking-requests', label: 'Booking Requests', icon: IconCalendar },
    ],
  },
  { to: '/reports', label: 'Reports', icon: IconChart, primary: true },
  { to: '/settings', label: 'Settings', icon: IconCog },
];

// Only shown to the Lintel operator, never to subscribers.
const platformAdminItems = [{ to: '/admin', label: 'Subscribers', icon: IconChart }];

const TITLES = {
  '/': 'Portfolio Overview',
  '/tenants': 'Tenants',
  '/tenants/onboard': 'Onboard Tenant',
  '/properties': 'Properties',
  '/properties/onboard': 'Add Property',
  '/units': 'Units',
  '/units/onboard': 'Add Apartment',
  '/leases': 'Leases',
  '/access': 'Access Cards',
  '/payments': 'Payments',
  '/faults-renovations': 'Costs, Faults & Renovations',
  '/booking-requests': 'Booking Requests',
  '/reports': 'Reports',
  '/staff': 'Staff & Access',
  '/settings': 'Settings',
  '/admin': 'Lintel Subscribers',
};

// Two in-company roles, shown to people as Admin / Member. (Any legacy
// 'viewer' also reads as Member.) Godmode = is_platform_admin, handled apart.
const ROLE_LABEL = { manager: 'Admin', finance: 'Member', viewer: 'Member' };

// Groups are replaced by their children for title lookup, and collapsed to a
// single destination for the mobile bar.
const flattenForTitle = (items) => items.flatMap((n) => (n.children ? n.children : [n]));
const toMobileItem = (n) => ({ ...n, to: n.to || n.mobileTo, label: n.label });

function pageTitle(pathname, items) {
  if (TITLES[pathname]) return TITLES[pathname];
  const section = flattenForTitle(items).find((n) => n.to && n.to !== '/' && pathname.startsWith(n.to));
  return section ? section.label : 'Lintel';
}

const childActiveFor = (item, pathname) =>
  item.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + '/'));

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformAdmin } = useAuth();
  // Subscribers never see the operator's cross-company dashboard.
  const visibleNav = isPlatformAdmin ? [...navItems, ...platformAdminItems] : navItems;
  const mobileNavItems = visibleNav.filter((n) => n.primary).map(toMobileItem);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const initials = user
    ? `${user.name.split(' ')[0]?.[0] || ''}${user.name.split(' ')[1]?.[0] || ''}`.toUpperCase() ||
      user.name[0]?.toUpperCase()
    : 'LM';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Tier 1 — dark icon rail (tablet + desktop) */}
      <aside className="hidden md:flex w-16 shrink-0 bg-ink flex-col items-center py-5 gap-1 sticky top-0 h-screen">
        <div
          className="w-9 h-9 rounded-xl text-white font-serif text-base flex items-center justify-center mb-4 shrink-0"
          style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}
        >
          L
        </div>
        <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-2">
          {visibleNav.map((item) =>
            item.children ? (
              <RailGroup key={item.label} item={item} pathname={location.pathname} />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) =>
                  `w-10 h-10 rounded-xl flex items-center justify-center transition ${
                    isActive ? 'bg-white text-ink' : 'text-white/45 hover:text-white/85 hover:bg-white/[0.06]'
                  }`
                }
              >
                <item.icon width={18} height={18} />
              </NavLink>
            )
          )}
        </nav>
        <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-white/45 flex items-center justify-center text-xs font-serif">
          v0.1
        </div>
      </aside>

      {/* Tier 2 — light nav panel (desktop only) */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-card border-r border-line flex-col sticky top-0 h-screen">
        <div className="px-6 pt-7 pb-5 border-b border-line/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-panel border border-line flex items-center justify-center text-xs font-semibold text-ink shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink truncate">{user?.name || 'Lintel Manager'}</div>
              <div className="text-xs text-stone truncate">{user ? ROLE_LABEL[user.role] : ''}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-stone hover:text-ink hover:bg-panel shrink-0"
            >
              <IconLogout width={14} height={14} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-5">
          <div className="lx-eyebrow px-2.5 mb-2">Menu</div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) =>
            item.children ? (
              <PanelGroup key={item.label} item={item} pathname={location.pathname} />
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                    isActive ? 'bg-panel text-ink font-medium' : 'text-stone hover:bg-panel/60 hover:text-ink'
                  }`
                }
              >
                <item.icon width={16} height={16} />
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="px-6 py-5 text-[11px] text-stone-light border-t border-line/80">
          Lintel &middot; Real Estate Intelligence
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-canvas/90 backdrop-blur border-b border-line/70">
          {/* Same max-w-6xl container as <main> below, so the page title lines
              up exactly with the content on every screen width. */}
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-5 flex items-center justify-between">
            <div>
              <div className="lx-eyebrow mb-1 hidden sm:block">{today}</div>
              <h1 className="font-serif text-xl sm:text-2xl text-ink">{pageTitle(location.pathname, visibleNav)}</h1>
            </div>
            <div className="md:hidden w-8 h-8 rounded-lg bg-ink text-white font-serif text-sm flex items-center justify-center">
              L
            </div>
          </div>
        </header>
        <main className="flex-1 pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
            <SubscriptionBanner />
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t border-line flex items-stretch">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[9.5px] font-medium transition ${
                isActive ? 'text-gold' : 'text-stone-light'
              }`
            }
          >
            <item.icon width={18} height={18} />
            <span className="leading-none">{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// Desktop labelled panel: a group header that expands on hover (and stays
// open while one of its children is the current page) to reveal its members.
function PanelGroup({ item, pathname }) {
  const [hover, setHover] = useState(false);
  const active = childActiveFor(item, pathname);
  const open = hover || active;
  const Icon = item.icon;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
          active ? 'text-ink font-medium' : 'text-stone hover:bg-panel/60 hover:text-ink'
        }`}
      >
        <Icon width={16} height={16} />
        {item.label}
        <IconChevron width={14} height={14} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all ${open ? 'max-h-40 mt-0.5' : 'max-h-0'}`}>
        <div className="ml-4 pl-3 border-l border-line/70 space-y-0.5">
          {item.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? 'bg-panel text-ink font-medium' : 'text-stone hover:bg-panel/60 hover:text-ink'
                }`
              }
            >
              <c.icon width={15} height={15} />
              {c.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

// Icon rail (tablet): the group icon shows a hover flyout listing its members
// to the right of the rail.
function RailGroup({ item, pathname }) {
  const active = childActiveFor(item, pathname);
  const Icon = item.icon;
  return (
    <div className="relative group w-full flex justify-center">
      <NavLink
        to={item.mobileTo}
        title={item.label}
        className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
          active ? 'bg-white text-ink' : 'text-white/45 group-hover:text-white/85 hover:bg-white/[0.06]'
        }`}
      >
        <Icon width={18} height={18} />
      </NavLink>
      {/* Flyout — bridged by pl-2 so the pointer can cross the gap without closing */}
      <div className="absolute left-full top-0 pl-2 hidden group-hover:block z-30">
        <div className="bg-card border border-line rounded-xl shadow-lift py-1.5 min-w-[160px]">
          <div className="lx-eyebrow px-3 py-1">{item.label}</div>
          {item.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 text-sm transition ${
                  isActive ? 'text-ink font-medium bg-panel' : 'text-stone hover:bg-panel/60 hover:text-ink'
                }`
              }
            >
              <c.icon width={15} height={15} />
              {c.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
