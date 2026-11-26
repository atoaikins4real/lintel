import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleApps } from '../config/apps.js';
import { IconGrid } from './icons.jsx';

// A compact dock of the role's apps — small icon buttons with labels, lined up
// so the dashboard stays tidy and the numbers below show at a glance. Built
// from the same catalog as the rail and ⌘K, filtered to what you can open.
// One scrollable row on phones, wraps on wider screens.
export default function AppLauncher() {
  const { role, can } = useAuth();
  const apps = roleApps(role).filter((a) => !a.perm || can(a.perm));
  if (!apps.length) return null;

  return (
    <div className="flex gap-x-4 gap-y-3 overflow-x-auto sm:flex-wrap pb-1 sm:justify-start"
      style={{ scrollbarWidth: 'none' }}>
      {apps.map((a) => {
        const Icon = a.icon || IconGrid;
        return (
          <NavLink key={a.to} to={a.to} end={a.to === '/'} title={a.desc || a.label}
            className="group flex flex-col items-center gap-1.5 w-[58px] sm:w-[66px] shrink-0 text-center">
            {({ isActive }) => (
              <>
                <span className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center transition shadow-soft border
                  ${isActive
                    ? 'bg-gold text-white border-transparent'
                    : 'bg-panel text-stone border-line group-hover:bg-gold group-hover:text-white group-hover:border-transparent'}`}>
                  <Icon width={18} height={18} />
                </span>
                <span className={`text-[11px] leading-tight truncate max-w-full transition ${isActive ? 'text-ink font-medium' : 'text-stone group-hover:text-ink'}`}>{a.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
