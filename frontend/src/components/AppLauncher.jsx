import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleApps } from '../config/apps.js';
import { IconGrid } from './icons.jsx';

// A compact dock of the role's apps — small icon buttons with labels, lined up
// so the dashboard stays tidy and the numbers below show at a glance. Built
// from the same catalog as the rail and ⌘K, filtered to what you can open.
export default function AppLauncher() {
  const { role, can } = useAuth();
  const apps = roleApps(role).filter((a) => !a.perm || can(a.perm));
  if (!apps.length) return null;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-3 sm:gap-x-6">
      {apps.map((a) => {
        const Icon = a.icon || IconGrid;
        return (
          <NavLink key={a.to} to={a.to} title={a.desc || a.label}
            className="group flex flex-col items-center gap-1.5 w-[64px] sm:w-[72px] text-center">
            <span className="w-11 h-11 rounded-2xl bg-panel border border-line flex items-center justify-center text-stone
                             group-hover:bg-gold group-hover:text-white group-hover:border-transparent transition shadow-soft">
              <Icon width={19} height={19} />
            </span>
            <span className="text-[11px] leading-tight text-stone group-hover:text-ink transition truncate max-w-full">{a.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
