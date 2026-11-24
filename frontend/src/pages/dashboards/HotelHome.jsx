import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReservations, getUnits, updateReservation, readApiError } from '../../api/client.js';
import StatCard from '../../components/StatCard.jsx';
import GettingStarted from '../../components/GettingStarted.jsx';
import { useSettings } from '../../context/SettingsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { IconCalendar, IconUsers, IconHome, IconBuilding, IconArrowRight, IconWallet, IconWrench } from '../../components/icons.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const nights = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const TODAY = iso(new Date());
const ACTIVE = ['confirmed', 'checked_in'];

// The hotelier's home is a front desk: who arrives today, who leaves today,
// who is in house, and how full tonight is. Everything is driven by real
// reservations — a brand-new hotel sees a calm "nothing booked yet" state.
export default function HotelHome() {
  const { money } = useSettings();
  const { user, company, canEdit } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => getReservations().then(setReservations);
  useEffect(() => {
    Promise.all([getUnits(), getReservations()])
      .then(([u, r]) => { setRooms(u); setReservations(r); })
      .catch((e) => setError(readApiError(e, 'load your front desk')))
      .finally(() => setLoading(false));
  }, []);

  const move = async (id, status) => {
    setError(''); setBusyId(id);
    try { await updateReservation(id, { status }); await load(); }
    catch (e) { setError(readApiError(e, 'update that reservation')); }
    finally { setBusyId(null); }
  };

  const coversToday = (r) => ACTIVE.includes(r.status) && r.check_in <= TODAY && r.check_out > TODAY;
  const arrivals = useMemo(() => reservations.filter((r) => r.status === 'confirmed' && r.check_in === TODAY), [reservations]);
  const departures = useMemo(() => reservations.filter((r) => r.status === 'checked_in' && r.check_out === TODAY), [reservations]);
  const inHouse = reservations.filter((r) => r.status === 'checked_in');
  const occupiedTonight = reservations.filter(coversToday).length;
  const occupancy = rooms.length ? Math.round((occupiedTonight / rooms.length) * 100) : 0;
  const upcoming = useMemo(() => reservations
    .filter((r) => r.status === 'confirmed' && r.check_in > TODAY && r.check_in <= addDays(TODAY, 7))
    .sort((a, b) => a.check_in.localeCompare(b.check_in)).slice(0, 6), [reservations]);
  const outOfOrder = rooms.filter((u) => u.status === 'maintenance' || u.status === 'off_market');

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const publicHref = company?.slug ? `/showcase/${company.slug}` : '/settings';
  const hasRooms = rooms.length > 0;

  if (loading) return <div className="text-stone text-sm">Loading&hellip;</div>;

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {/* Hero */}
      <section className="relative rounded-[28px] overflow-hidden mb-6 shadow-lift bg-ink min-h-[440px]">
        <img src="/bg1.jpg" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { if (!e.currentTarget.dataset.fb) { e.currentTarget.dataset.fb = '1'; e.currentTarget.src = '/app1.jpg'; } }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,16,12,0.55) 0%, rgba(20,16,12,0.12) 30%, rgba(20,16,12,0.55) 78%, rgba(20,16,12,0.88) 100%)' }} />
        <div className="relative z-10 flex flex-col justify-between gap-8 min-h-[440px] p-6 sm:p-9 md:p-10">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-gold-light mb-3">
                Rooms <span className="text-white/40">—</span> Reservations <span className="text-white/40">—</span> Guests
              </div>
              <h1 className="font-serif text-white leading-[1.04] text-[34px] sm:text-[48px] md:text-[54px]">
                {greeting},<br /><span className="text-gold-light">{firstName}.</span>
              </h1>
              <p className="text-white/80 text-sm sm:text-base mt-4 max-w-md">
                {hasRooms
                  ? `${occupancy}% of your ${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} booked tonight · ${arrivals.length} arriving · ${departures.length} leaving.`
                  : 'Add your rooms to open the front desk and start taking reservations.'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mt-6">
                <Link to={hasRooms ? '/reservations' : '/units/onboard'}
                  className="inline-flex items-center gap-2 rounded-full bg-white text-ink px-5 py-3 text-sm font-medium hover:bg-white/90 transition shadow-soft">
                  {hasRooms ? 'New reservation' : 'Add your first room'} <IconArrowRight width={16} height={16} />
                </Link>
                <a href={publicHref} target={company?.slug ? '_blank' : undefined} rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 text-white text-sm font-medium group">
                  <span className="w-10 h-10 rounded-full bg-white/15 border border-white/30 backdrop-blur flex items-center justify-center group-hover:bg-white/25 transition">
                    <IconArrowRight width={16} height={16} />
                  </span>
                  View your public page
                </a>
              </div>
            </div>
            {hasRooms && (
              <div className="hidden lg:flex flex-col items-end gap-3 text-right shrink-0">
                {[['Tonight', `${occupancy}%`], ['Rooms', rooms.length], ['In house', inHouse.length], ['Arrivals', arrivals.length]].map(([l, v]) => (
                  <div key={l}>
                    <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/50">{l}</div>
                    <div className="text-white font-serif text-base leading-none mt-1">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Arrivals today" value={arrivals.length} icon={IconCalendar} sub="Due to check in" />
        <StatCard label="Departures today" value={departures.length} icon={IconArrowRight} sub="Due to check out" />
        <StatCard label="In house" value={inHouse.length} icon={IconUsers} sub="Guests staying now" />
        <StatCard label="Occupied tonight" value={`${occupancy}%`} icon={IconHome} sub={`${occupiedTonight} of ${rooms.length || 0} rooms`} />
      </div>

      {!hasRooms ? (
        <GettingStarted />
      ) : (
        <>
          {/* Front desk board */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <DeskColumn title="Arriving today" empty="No arrivals today." rows={arrivals}
              money={money} canEdit={canEdit} busyId={busyId}
              action={(r) => canEdit && <button disabled={busyId === r.id} onClick={() => move(r.id, 'checked_in')} className="lx-btn-gold !py-1.5 !px-3 text-xs">Check in</button>} />
            <DeskColumn title="Leaving today" empty="No departures today." rows={departures}
              money={money} canEdit={canEdit} busyId={busyId}
              action={(r) => canEdit && <button disabled={busyId === r.id} onClick={() => move(r.id, 'checked_out')} className="lx-btn-primary !py-1.5 !px-3 text-xs">Check out</button>} />
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <QuickAction to="/reservations" icon={IconCalendar} title="New reservation" sub="Book a stay" />
            <QuickAction to="/units/onboard" icon={IconBuilding} title="Add a room" sub="Grow your inventory" />
            <QuickAction to="/payments" icon={IconWallet} title="Record a payment" sub="Payment received" />
            <QuickAction to={publicHref} external={Boolean(company?.slug)} icon={IconHome}
              title="View your public page" sub={company?.slug ? 'What guests see' : 'Set up your link'} />
          </div>

          {/* Upcoming + rooms needing attention */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lx-card p-5 lg:col-span-2">
              <div className="flex items-baseline justify-between mb-3">
                <div className="lx-eyebrow">Arriving in the next 7 days</div>
                <Link to="/reservations" className="text-xs text-gold hover:underline">All reservations →</Link>
              </div>
              {upcoming.length ? (
                <ul className="divide-y divide-line/70">
                  {upcoming.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink truncate">{r.guest_display}</div>
                        <div className="text-xs text-stone">Room {r.unit_code} · {r.check_in} → {r.check_out} · {nights(r.check_in, r.check_out)} night{nights(r.check_in, r.check_out) === 1 ? '' : 's'}</div>
                      </div>
                      {r.nightly_rate ? <span className="text-xs text-ink font-medium shrink-0">{money(r.nightly_rate * nights(r.check_in, r.check_out))}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-stone">Nothing booked for the week ahead yet.</p>}
            </div>

            <div className="lx-card p-5">
              <div className="lx-eyebrow mb-3">Rooms out of service</div>
              {outOfOrder.length ? (
                <ul className="space-y-2.5">
                  {outOfOrder.map((u) => (
                    <li key={u.id} className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-panel border border-line flex items-center justify-center text-stone shrink-0"><IconWrench width={14} height={14} /></span>
                      <Link to={`/units/${u.id}`} className="text-sm text-ink hover:text-gold transition truncate">Room {u.unit_code}</Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-stone">Every room is in service.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeskColumn({ title, rows, empty, money, action }) {
  return (
    <div className="lx-card p-5">
      <h3 className="font-serif text-lg text-ink mb-3">{title} {rows.length > 0 && <span className="text-sm text-stone font-sans">· {rows.length}</span>}</h3>
      {rows.length === 0 ? <p className="text-sm text-stone">{empty}</p> : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 bg-panel/50 rounded-xl px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink truncate">{r.guest_display}</div>
                <div className="text-xs text-stone">Room {r.unit_code} · {r.check_in} → {r.check_out}{r.guest_contact ? ` · ${r.guest_contact}` : ''}</div>
              </div>
              <div className="shrink-0">{action(r)}</div>
            </div>
          ))}
        </div>
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
