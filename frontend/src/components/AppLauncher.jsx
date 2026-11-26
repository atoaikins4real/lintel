import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleApps } from '../config/apps.js';
import { IconGrid } from './icons.jsx';

// The home hub — every app your role has, as a grid you return to. Built from
// the same catalog as the rail and ⌘K, and filtered to what this worker can
// open, so it is always in step with the rest of the shell.
export default function AppLauncher() {
  const { role, can } = useAuth();
  const apps = roleApps(role).filter((a) => !a.perm || can(a.perm));
  if (!apps.length) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-1">
        <IconGrid width={15} height={15} className="text-gold" />
        <h3 className="font-serif text-lg text-ink">Your apps</h3>
        <span className="text-xs text-stone hidden sm:inline ml-1">everything you manage, in one place</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {apps.map((a) => {
          const Icon = a.icon || IconGrid;
          return (
            <Link key={a.to} to={a.to} className="lx-card lx-lift p-4 flex flex-col gap-2.5 group">
              <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0 group-hover:bg-gold group-hover:text-white transition">
                <Icon width={18} height={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink truncate">{a.label}</span>
                {a.desc && <span className="block text-xs text-stone leading-snug line-clamp-2">{a.desc}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
