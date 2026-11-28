import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReservations, getUnits, updateReservation, readApiError } from '../../api/client.js';
import StatCard from '../../components/StatCard.jsx';
import GettingStarted from '../../components/GettingStarted.jsx';
import DashboardTop from '../../components/DashboardTop.jsx';
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

      {/* Compact hero + search + app dock. */}
      <DashboardTop stats={[{ label: 'Arrivals today', value: arrivals.length }, { label: 'Occupied', value: `${occupancy}%` }, { label: 'In house', value: inHouse.length }]} />

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
