import { useAuth } from '../context/AuthContext.jsx';
import { roleHero } from '../config/apps.js';
import DashboardSearch from './DashboardSearch.jsx';
import AppLauncher from './AppLauncher.jsx';
import { IconArrowRight } from './icons.jsx';

// The tidy top of every role dashboard: a representative photo + greeting, a
// front-and-centre search, and a compact dock of your apps — so the numbers
// below (arrivals, departures, occupancy…) sit high and show at a glance.
export default function DashboardTop() {
  const { user, company, role } = useAuth();
  const hero = roleHero(role);
  const first = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const publicHref = company?.slug ? `/showcase/${company.slug}` : '/settings';
  const publicExternal = Boolean(company?.slug);

  return (
    <section className="mb-6">
      {/* Representative hero — compact, theme-independent colours over the photo. */}
      <div className="relative rounded-[24px] overflow-hidden shadow-lift h-[200px] sm:h-[240px]">
        <img
          src={hero.src} alt={hero.alt} aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = hero.fallback; } }}
        />
        {/* Role identity wash — tints the hero with the role/brand accent. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, var(--color-gold) 0%, transparent 58%)', opacity: 0.35, mixBlendMode: 'multiply' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,16,12,0.34) 0%, rgba(20,16,12,0.12) 40%, rgba(20,16,12,0.74) 100%)' }} />
        <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light">{hero.eyebrow}</div>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-serif text-white leading-[1.05] text-[28px] sm:text-[38px]">
                {greeting}, <span className="text-gold-light">{first}.</span>
              </h1>
              <p className="text-white/80 text-sm mt-1.5 max-w-md">{hero.tagline}</p>
            </div>
            <a href={publicHref} target={publicExternal ? '_blank' : undefined} rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-2 text-white text-xs font-medium group shrink-0">
              <span className="w-9 h-9 rounded-full bg-white/15 border border-white/30 backdrop-blur flex items-center justify-center group-hover:bg-white/25 transition">
                <IconArrowRight width={15} height={15} />
              </span>
              Public page
            </a>
          </div>
        </div>
      </div>

      {/* Search — overlaps the hero's lower edge, front and centre. */}
      <div className="relative z-20 -mt-7 px-2 sm:px-6">
        <DashboardSearch />
      </div>

      {/* Compact app dock beneath the search. */}
      <div className="mt-5 px-1">
        <AppLauncher />
      </div>
    </section>
  );
}
