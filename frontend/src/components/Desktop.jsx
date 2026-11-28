import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleApps } from '../config/apps.js';
import DashboardSearch from './DashboardSearch.jsx';
import { IconGrid, IconChart, IconArrowRight } from './icons.jsx';

// The Lintel desktop — the operating-system home screen. Wallpaper (from the
// Layout) with glass widgets and an Android-style grid of app icons. Tapping an
// icon opens that app in a window. The rich role dashboard lives in the
// "Overview" app.
export default function Desktop() {
  const { user, role, can, isPlatformAdmin } = useAuth();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const first = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const apps = [
    { to: '/overview', label: 'Overview', icon: IconGrid },
    ...roleApps(role).filter((a) => !a.perm || can(a.perm)),
    ...(isPlatformAdmin ? [{ to: '/admin', label: 'Subscribers', icon: IconChart }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-8">
      {/* Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-4 mb-7">
        <div className="lx-glass rounded-3xl p-6 shadow-lift ring-1 ring-white/20">
          <div className="lx-eyebrow text-stone mb-1.5">{date}</div>
          <div className="font-serif text-4xl sm:text-5xl text-ink leading-none">{time}</div>
          <div className="text-stone text-sm mt-3">{greeting}, <span className="text-gold font-medium">{first}</span>.</div>
        </div>
        <Link to="/overview" className="lx-glass rounded-3xl p-6 shadow-lift ring-1 ring-white/20 lx-lift flex flex-col justify-between gap-6">
          <div className="lx-eyebrow text-stone">Your workspace</div>
          <div>
            <div className="font-serif text-xl text-ink">Open dashboard</div>
            <div className="text-stone text-xs mt-1 flex items-center gap-1">Today at a glance <IconArrowRight width={13} height={13} /></div>
          </div>
        </Link>
      </div>

      {/* Spotlight search */}
      <div className="max-w-xl mx-auto mb-8 drop-shadow-xl">
        <DashboardSearch />
      </div>

      {/* App icons */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-5">
        {apps.map((a) => {
          const Icon = a.icon || IconGrid;
          return (
            <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-2 text-center">
              <span className="w-14 h-14 rounded-2xl bg-panel/90 border border-line/60 shadow-soft flex items-center justify-center text-ink/75 transition
                group-hover:bg-gold group-hover:text-white group-hover:-translate-y-0.5 group-hover:shadow-lift">
                <Icon width={24} height={24} />
              </span>
              <span className="text-[11px] text-ink/85 leading-tight truncate max-w-full">{a.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
