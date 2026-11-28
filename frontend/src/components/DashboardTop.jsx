import { useAuth } from '../context/AuthContext.jsx';
import { roleHero } from '../config/apps.js';
import DashboardSearch from './DashboardSearch.jsx';
import AppLauncher from './AppLauncher.jsx';
import { IconArrowRight } from './icons.jsx';

// The home as an "operating-system desktop": a large wallpaper (the role photo)
// with everything floating on it in frosted glass — the greeting, a spotlight
// search, and a macOS-style dock of your apps. The dashboard's numbers follow
// below. Inspired by the glassmorphism / liquid-glass dock UI trend.
export default function DashboardTop({ stats = [] }) {
  const { user, company, role } = useAuth();
  const hero = roleHero(role);
  const first = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const publicHref = company?.slug ? `/showcase/${company.slug}` : '/settings';
  const publicExternal = Boolean(company?.slug);

  return (
    <section className="mb-6">
      <div className="relative rounded-[28px] overflow-hidden shadow-lift h-[460px] sm:h-[560px]">
        {/* Wallpaper */}
        <img
          src={hero.src} alt={hero.alt} aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = hero.fallback; } }}
        />
        {/* Role identity wash — a restrained accent tint, keeping the luxury feel. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, transparent 50%, var(--color-gold) 125%)', opacity: 0.26, mixBlendMode: 'multiply' }} />
        {/* Legibility: darker at the very top (greeting) and bottom (dock), clear
            through the middle so the wallpaper shows behind the glass. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,16,12,0.56) 0%, rgba(20,16,12,0.10) 26%, rgba(20,16,12,0.04) 52%, rgba(20,16,12,0.40) 82%, rgba(20,16,12,0.72) 100%)' }} />

        {/* ── Top bar: greeting (left), public page (right) ─────────────── */}
        <div className="absolute inset-x-0 top-0 z-10 p-5 sm:p-7 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-light mb-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}>
              {hero.eyebrow}
            </div>
            <h1 className="font-serif text-white leading-[1.03] text-[30px] sm:text-[44px]" style={{ textShadow: '0 2px 14px rgba(0,0,0,0.35)' }}>
              {greeting}, <span className="text-gold-light">{first}.</span>
            </h1>
            <p className="text-white/85 text-sm mt-2 max-w-md hidden sm:block" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>{hero.tagline}</p>
          </div>
          <a href={publicHref} target={publicExternal ? '_blank' : undefined} rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 text-white text-xs font-medium group shrink-0 rounded-full bg-white/15 border border-white/25 backdrop-blur-md pl-3 pr-1.5 py-1.5 hover:bg-white/25 transition">
            Public page
            <span className="w-7 h-7 rounded-full bg-white/90 text-ink flex items-center justify-center">
              <IconArrowRight width={14} height={14} />
            </span>
          </a>
        </div>

        {/* ── Floating glass stat widgets (bento) — upper right ─────────── */}
        {stats.length > 0 && (
          <div className="absolute right-5 sm:right-7 top-[88px] sm:top-[104px] z-10 hidden lg:flex flex-col gap-2.5 w-44">
            {stats.slice(0, 3).map((s) => (
              <div key={s.label} className="lx-glass rounded-2xl px-4 py-3 shadow-lift ring-1 ring-white/25">
                <div className="lx-eyebrow text-stone mb-0.5">{s.label}</div>
                <div className="font-serif text-xl text-ink leading-none">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Spotlight search — floating, centred ──────────────────────── */}
        <div className="absolute z-20 inset-x-0 top-1/2 -translate-y-1/2 px-5 sm:px-8">
          <div className="max-w-xl mx-auto drop-shadow-2xl">
            <DashboardSearch />
          </div>
        </div>

        {/* ── Frosted glass dock — floating near the bottom ─────────────── */}
        <div className="absolute z-10 inset-x-0 bottom-4 sm:bottom-5 flex justify-center px-4">
          <div className="lx-glass rounded-[26px] shadow-lift ring-1 ring-white/25 px-3 sm:px-4 py-2.5 max-w-full"
            style={{ backdropFilter: 'blur(18px) saturate(1.3)' }}>
            <AppLauncher />
          </div>
        </div>
      </div>
    </section>
  );
}
