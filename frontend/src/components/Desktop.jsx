import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { roleApps } from '../config/apps.js';
import DashboardSearch from './DashboardSearch.jsx';
import { IconGrid, IconChart, IconArrowRight, IconBulb } from './icons.jsx';

// Short, role-neutral tips that teach the OS gestures. One shows at a time and
// rotates; tapping the pill advances to the next.
const TIPS = [
  'Press ⌘K (Ctrl+K) or tap search to jump to any app or record.',
  'Tap an app to open it — minimise keeps it running in the dock below.',
  'Use ＋ in the top bar to quickly add a record from anywhere.',
  'Open the recent-apps switcher (▦ in the dock) to flick between what’s open.',
  'Your wallpaper and apps follow what you manage — set a brand colour in Settings.',
  'Everything you open stays in the dock: tap to switch, × to close.',
];

// The Lintel desktop — the operating-system home screen. On a laptop or desktop
// it fits the viewport with no vertical scroll (compact widgets, small icons);
// on a phone it flows naturally and scrolls, with larger touch targets.
export default function Desktop() {
  const { user, role, can, isPlatformAdmin } = useAuth();
  const [now, setNow] = useState(new Date());
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 9000); return () => clearInterval(t); }, []);

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
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-4 sm:pt-5 pb-[84px] sm:pb-[78px]
      flex flex-col gap-4 sm:gap-4 sm:h-[calc(100dvh-66px)] sm:overflow-hidden">
      {/* Widgets — clock + a shortcut into the full dashboard. */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-3 sm:gap-4 shrink-0">
        <div className="lx-glass rounded-3xl px-5 py-4 sm:py-5 shadow-lift ring-1 ring-white/20">
          <div className="lx-eyebrow text-stone mb-1">{date}</div>
          <div className="font-serif text-3xl sm:text-4xl text-ink leading-none">{time}</div>
          <div className="text-stone text-sm mt-2">{greeting}, <span className="text-gold font-medium">{first}</span>.</div>
        </div>
        <Link to="/overview" className="lx-glass rounded-3xl px-5 py-4 sm:py-5 shadow-lift ring-1 ring-white/20 lx-lift flex items-center justify-between gap-4">
          <div>
            <div className="lx-eyebrow text-stone mb-1">Your workspace</div>
            <div className="font-serif text-lg sm:text-xl text-ink leading-tight">Open dashboard</div>
            <div className="text-stone text-xs mt-0.5">Today at a glance</div>
          </div>
          <span className="w-9 h-9 rounded-full bg-gold/12 text-gold flex items-center justify-center shrink-0"><IconArrowRight width={16} height={16} /></span>
        </Link>
      </div>

      {/* Spotlight search */}
      <div className="w-full max-w-xl mx-auto drop-shadow-xl shrink-0">
        <DashboardSearch />
      </div>

      {/* Tip of the moment */}
      <button type="button" onClick={() => setTip((i) => (i + 1) % TIPS.length)}
        className="mx-auto max-w-xl w-full flex items-center gap-2.5 lx-glass rounded-full px-4 py-2 ring-1 ring-white/15 text-left shrink-0"
        title="Next tip">
        <span className="w-6 h-6 rounded-full bg-gold/15 text-gold flex items-center justify-center shrink-0"><IconBulb width={14} height={14} /></span>
        <span className="text-xs text-ink/80 leading-snug truncate">{TIPS[tip]}</span>
      </button>

      {/* App icons — fill the remaining space on desktop (no scroll); the grid
          itself scrolls only if a very small viewport forces it. */}
      <div className="flex-1 min-h-0 sm:overflow-y-auto">
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-x-3 gap-y-4 sm:gap-y-3 content-start pt-1">
          {apps.map((a) => {
            const Icon = a.icon || IconGrid;
            return (
              <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-1.5 text-center">
                <span className="w-14 h-14 sm:w-12 sm:h-12 rounded-2xl bg-panel/90 border border-line/60 shadow-soft flex items-center justify-center text-ink/75 transition
                  group-hover:bg-gold group-hover:text-white group-hover:-translate-y-0.5 group-hover:shadow-lift">
                  <Icon width={22} height={22} />
                </span>
                <span className="text-[11px] text-ink/85 leading-tight truncate max-w-full">{a.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
