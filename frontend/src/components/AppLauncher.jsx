import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { dockApps } from '../config/apps.js';
import { IconGrid } from './icons.jsx';

// A macOS-style glass dock of the role's five most-relevant apps. Frosted icon
// tiles that magnify and lift on hover; the active app glows in the accent.
// Everything else is one tap away in the rail and ⌘K.
export default function AppLauncher() {
  const { role, can } = useAuth();
  const apps = dockApps(role).filter((a) => !a.perm || can(a.perm));
  if (!apps.length) return null;

  return (
    <div className="flex items-end gap-x-2.5 sm:gap-x-3 overflow-x-auto pb-0.5 justify-start sm:justify-center"
      style={{ scrollbarWidth: 'none' }}>
      {apps.map((a) => {
        const Icon = a.icon || IconGrid;
        return (
          <NavLink key={a.to} to={a.to} end={a.to === '/'} title={a.desc || a.label}
            className="group flex flex-col items-center gap-1.5 w-[58px] sm:w-[64px] shrink-0 text-center">
            {({ isActive }) => (
              <>
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-soft transition-all duration-200 origin-bottom
                  group-hover:scale-[1.18] group-hover:-translate-y-1.5 group-hover:shadow-lift
                  ${isActive ? 'bg-gold text-white' : 'bg-panel/90 text-ink/75 group-hover:bg-gold group-hover:text-white'}`}>
                  <Icon width={20} height={20} />
                </span>
                <span className={`text-[10px] leading-tight truncate max-w-full transition ${isActive ? 'text-ink font-medium' : 'text-stone group-hover:text-ink'}`}>{a.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
