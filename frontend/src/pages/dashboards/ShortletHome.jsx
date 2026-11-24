import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReservations, getUnits, readApiError } from '../../api/client.js';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import GettingStarted from '../../components/GettingStarted.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { IconCalendar, IconUsers, IconHome, IconBuilding, IconArrowRight, IconWallet } from '../../components/icons.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const nights = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const TODAY = iso(new Date());
const ACTIVE = ['confirmed', 'checked_in'];

// The short-let host's home leads with the calendar and the money: how full the
// week ahead is, what each stay is worth, and what's coming in. Driven entirely
// by real bookings — an empty account sees a clean "add a listing" start.
export default function ShortletHome() {
  const { money } = useSettings();
  const { user, company, canEdit } = useAuth();
  const [listings, setListings] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getUnits(), getReservations()])
      .then(([u, r]) => { setListings(u); setReservations(r); })
      .catch((e) => setError(readApiError(e, 'load your calendar')))
      .finally(() => setLoading(false));
  }, []);

  const total = listings.length;
  const coversNight = (r, day) => ACTIVE.includes(r.status) && r.check_in <= day && r.check_out > day;
  const bookedOn = (day) => reservations.filter((r) => coversNight(r, day)).length;
  const bookedTonight = bookedOn(TODAY);
  const occupancyTonight = total ? Math.round((bookedTonight / total) * 100) : 0;
  const arrivalsToday = reservations.filter((r) => r.status === 'confirmed' && r.check_in === TODAY).length;

  const next30 = addDays(TODAY, 30);
  const upcoming = useMemo(() => reservations
    .filter((r) => ACTIVE.includes(r.status) && r.check_out >= TODAY)
    .sort((a, b) => a.check_in.localeCompare(b.check_in)), [reservations]);
  const upcoming30 = upcoming.filter((r) => r.check_in <= next30);
  // Expected income from stays that are confirmed or in house and not yet past.
  const expected = upcoming
    .filter((r) => r.check_in <= next30)
    .reduce((s, r) => s + (Number(r.nightly_rate || 0) * nights(r.check_in, r.check_out)), 0);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(TODAY, i);
    return { d, booked: bookedOn(d) };
  }), [reservations, listings]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const publicHref = company?.slug ? `/showcase/${company.slug}` : '/settings';
  const hasListings = total > 0;

  if (loading) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {/* Hero */}
      <section className="relative rounded-[28px] overflow-hidden mb-6 shadow-lift bg-ink min-h-[420px]">
        <img src="/bg1.jpg" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = '/app1.jpg'; } }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,16,12,0.5) 0%, rgba(20,16,12,0.12) 32%, rgba(20,16,12,0.5) 76%, rgba(20,16,12,0.88) 100%)' }} />
        <div className="relative z-10 flex flex-col justify-between gap-8 min-h-[420px] p-6 sm:p-9 md:p-10">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-light mb-3">
                Calendar <span className="text-white/40">—</span> Guests <span className="text-white/40">—</span> Payouts
              </div>
              <h1 className="font-serif text-white leading-[1.04] text-[34px] sm:text-[48px] md:text-[54px]">
                {greeting},<br /><span className="text-gold-light">{firstName}.</span>
              </h1>
              <p className="text-white/80 text-sm sm:text-base mt-4 max-w-md">
                {hasListings
                  ? `${bookedTonight} of ${total} ${total === 1 ? 'place' : 'places'} booked tonight · ${money(expected)} expected over the next 30 days.`
                  : 'Add your first listing to open your booking calendar and start taking stays.'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-6">
                <Link to={hasListings ? '/reservations' : '/units/onboard'}
                  className="inline-flex items-center gap-2 rounded-full bg-white text-ink px-5 py-3 text-sm font-medium hover:bg-white/90 transition shadow-soft">
                  {hasListings ? 'New booking' : 'Add your first listing'} <IconArrowRight width={16} height={16} />
                </Link>
                <a href={publicHref} target={company?.slug ? '_blank' : undefined} rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-white text-sm font-medium group">
                  <span className="w-10 h-10 rounded-full bg-white/15 border border-white/30 backdrop-blur flex items-center justify-center group-hover:bg-white/25 transition">
                    <IconArrowRight width={16} height={16} />
                  </span>
                  Share your listings
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Booked tonight" value={`${bookedTonight}/${total || 0}`} icon={IconHome} sub={`${occupancyTonight}% of your places`} />
        <StatCard label="Arrivals today" value={arrivalsToday} icon={IconCalendar} sub="Guests checking in" />
        <StatCard label="Upcoming stays" value={upcoming30.length} icon={IconUsers} sub="Next 30 days" />
        <StatCard label="Expected income" value={money(expected)} icon={IconWallet} sub="Next 30 days" />
      </div>

      {!hasListings ? (
        <GettingStarted />
      ) : (
        <>
          {/* Week-ahead occupancy strip */}
          <div className="lx-card p-5 mb-6">
            <div className="flex items-baseline justify-between mb-4">
              <div className="lx-eyebrow">The next 7 nights</div>
              <Link to="/reservations" className="text-xs text-gold hover:underline">Open calendar →</Link>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {week.map(({ d, booked }) => {
                const dt = new Date(d + 'T00:00:00');
                const pct = total ? Math.round((booked / total) * 100) : 0;
                return (
                  <div key={d} className="flex flex-col items-center gap-1.5">
                    <div className="text-[10px] text-stone">{dt.toLocaleDateString(undefined, { weekday: 'short' })[0]}</div>
                    <div className="w-full h-20 rounded-lg bg-panel overflow-hidden flex items-end" title={`${booked} of ${total} booked`}>
                      <div className="w-full bg-gold/80" style={{ height: `${Math.max(booked ? 12 : 0, pct)}%` }} />
                    </div>
                    <div className={`text-[11px] font-medium ${d === TODAY ? 'text-gold' : 'text-ink'}`}>{booked}/{total}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <QuickAction to="/reservations" icon={IconCalendar} title="New booking" sub="Block some dates" />
            <QuickAction to="/units/onboard" icon={IconBuilding} title="Add a listing" sub="A new place to let" />
            <QuickAction to="/tenants" icon={IconUsers} title="Guest register" sub="Who's stayed" />
            <QuickAction to={publicHref} external={Boolean(company?.slug)} icon={IconHome}
              title="Share your listings" sub={company?.slug ? 'What guests see' : 'Set up your link'} />
          </div>

          {/* Upcoming stays + listings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lx-card p-5 lg:col-span-2">
              <div className="lx-eyebrow mb-3">Upcoming stays</div>
              {upcoming.length ? (
                <ul className="divide-y divide-line/70">
                  {upcoming.slice(0, 7).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink truncate">{r.guest_display}</div>
                        <div className="text-xs text-stone">{r.unit_code} · {r.check_in} → {r.check_out} · {nights(r.check_in, r.check_out)} night{nights(r.check_in, r.check_out) === 1 ? '' : 's'}</div>
                      </div>
                      {r.nightly_rate ? <span className="text-xs text-ink font-medium shrink-0">{money(r.nightly_rate * nights(r.check_in, r.check_out))}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-stone">No stays booked yet — share your listings to start taking bookings.</p>}
            </div>

            <div className="lx-card p-5">
              <div className="lx-eyebrow mb-3">Your listings</div>
              <ul className="space-y-2.5">
                {listings.slice(0, 6).map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <Link to={`/units/${u.id}`} className="text-sm text-ink hover:text-gold transition truncate min-w-0">{u.unit_code}</Link>
                    <span className="flex items-center gap-2 shrink-0">
                      {u.base_rate_short ? <span className="text-xs text-stone">{money(u.base_rate_short)}/nt</span> : null}
                      <StatusBadge status={u.status} />
                    </span>
                  </li>
                ))}
              </ul>
              {listings.length > 6 && <Link to="/rooms" className="text-xs text-gold hover:underline mt-3 inline-block">All listings →</Link>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, sub, external }) {
  const inner = (
    <>
      <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold flex items-center justify-center shrink-0"><Icon width={18} height={18} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink truncate">{title}</span>
        <span className="block text-xs text-stone truncate">{sub}</span>
      </span>
    </>
  );
  const cls = 'lx-card lx-lift p-4 flex items-center gap-3';
  return external ? <a href={to} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <Link to={to} className={cls}>{inner}</Link>;
}
