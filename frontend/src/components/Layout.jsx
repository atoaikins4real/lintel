import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IconGrid, IconUsers, IconBuilding, IconFile, IconWallet, IconWrench, IconChart, IconCalendar, IconCog, IconShield, IconKey, IconHome, IconLogout } from './icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// `primary` marks the items that also appear in the mobile bottom tab bar
// — that bar only fits about five before the labels become unreadable, so
// the rest stay in the sidebars on larger screens.
const navItems = [
  { to: '/', label: 'Dashboard', end: true, icon: IconGrid, primary: true },
  { to: '/tenants', label: 'Tenants', icon: IconUsers, primary: true },
  { to: '/properties', label: 'Properties', icon: IconHome, primary: true },
  { to: '/units', label: 'Units', icon: IconBuilding },
  { to: '/leases', label: 'Leases', icon: IconFile },
  { to: '/access', label: 'Access Cards', icon: IconKey },
  { to: '/payments', label: 'Payments', icon: IconWallet, primary: true },
  { to: '/faults-renovations', label: 'Faults & Reno.', icon: IconWrench },
  { to: '/booking-requests', label: 'Booking Requests', icon: IconCalendar },
  { to: '/reports', label: 'Reports', icon: IconChart, primary: true },
  { to: '/staff', label: 'Staff', icon: IconShield },
  { to: '/settings', label: 'Settings', icon: IconCog },
];

// Only shown to the Lintel operator, never to subscribers.
const platformAdminItems = [{ to: '/admin', label: 'Subscribers', icon: IconChart }];

const mobileNavItems = navItems.filter((n) => n.primary);

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
  '/faults-renovations': 'Faults & Renovations',
  '/booking-requests': 'Booking Requests',
  '/reports': 'Reports',
  '/staff': 'Staff & Access',
  '/settings': 'Settings',
  '/admin': 'Lintel Subscribers',
};

const ROLE_LABEL = { manager: 'Manager', finance: 'Finance', viewer: 'Viewer' };

function pageTitle(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const section = navItems.find((n) => pathname.startsWith(n.to) && n.to !== '/');
  return section ? section.label : 'Lintel';
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isPlatformAdmin } = useAuth();
  // Subscribers never see the operator's cross-company dashboard.
  const visibleNav = isPlatformAdmin ? [...navItems, ...platformAdminItems] : navItems;
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const initials = user ? `${user.name.split(' ')[0]?.[0] || ''}${user.name.split(' ')[1]?.[0] || ''}`.toUpperCase() || user.name[0]?.toUpperCase() : 'LM';

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
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
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
                <Icon width={18} height={18} />
              </NavLink>
            );
          })}
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
        <nav className="flex-1 px-3 space-y-0.5">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
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
                <Icon width={16} height={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-6 py-5 text-[11px] text-stone-light border-t border-line/80">
          Lintel &middot; Real Estate Intelligence
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-10 bg-canvas/90 backdrop-blur border-b border-line/70">
          <div className="px-4 sm:px-6 lg:px-10 py-5 flex items-center justify-between">
            <div>
              <div className="lx-eyebrow mb-1 hidden sm:block">{today}</div>
              <h1 className="font-serif text-xl sm:text-2xl text-ink">{pageTitle(location.pathname)}</h1>
            </div>
            <div className="md:hidden w-8 h-8 rounded-lg bg-ink text-white font-serif text-sm flex items-center justify-center">
              L
            </div>
          </div>
        </header>
        <main className="flex-1 pb-20 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">{children}</div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t border-line flex items-stretch">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
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
              <Icon width={18} height={18} />
              <span className="leading-none">{item.label.split(' ')[0]}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
