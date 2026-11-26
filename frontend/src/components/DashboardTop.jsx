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
      <div className="relative rounded-[24px] overflow-hidden shadow-lift h-[280px] sm:h-[360px]">
        <img
          src={hero.src} alt={hero.alt} aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = hero.fallback; } }}
        />
        {/* Role identity wash — a restrained accent tint from the lower-left,
            keeping the luxury, stone-toned feel rather than a loud colour cast. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, transparent 45%, var(--color-gold) 120%)', opacity: 0.28, mixBlendMode: 'multiply' }} />
        {/* Readability scrim — darker toward the bottom where the text sits, so
            the eyebrow and headline stay legible over any photo. */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,16,12,0.30) 0%, rgba(20,16,12,0.20) 38%, rgba(20,16,12,0.72) 80%, rgba(20,16,12,0.86) 100%)' }} />

        {/* Public-page link, pinned to the top-right corner. */}
        <a href={publicHref} target={publicExternal ? '_blank' : undefined} rel="noopener noreferrer"
          className="absolute top-5 right-5 sm:top-7 sm:right-7 z-10 hidden sm:inline-flex items-center gap-2 text-white text-xs font-medium group">
          <span className="w-9 h-9 rounded-full bg-white/15 border border-white/30 backdrop-blur flex items-center justify-center group-hover:bg-white/25 transition">
            <IconArrowRight width={15} height={15} />
          </span>
          Public page
        </a>

        {/* Content cluster — eyebrow, headline and tagline together in the dark
            lower band, echoing the reference's stacked title treatment. */}
        <div className="relative z-10 h-full flex flex-col justify-end p-5 sm:p-7">
          <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-light mb-2.5" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
            {hero.eyebrow}
          </div>
          <h1 className="font-serif text-white leading-[1.04] text-[30px] sm:text-[42px]" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.25)' }}>
            {greeting}, <span className="text-gold-light">{first}.</span>
          </h1>
          <p className="text-white/85 text-sm mt-2 max-w-md">{hero.tagline}</p>
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
