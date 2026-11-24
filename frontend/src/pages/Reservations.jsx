import { useEffect, useMemo, useState } from 'react';
import {
  getReservations, createReservation, updateReservation, deleteReservation, checkAvailability,
  getUnits, getTenants, readApiError,
} from '../api/client.js';
import StatCard from '../components/StatCard.jsx';
import RowActions from '../components/RowActions.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { IconCalendar, IconBuilding, IconUsers, IconHome } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const nightsBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
const TODAY = iso(new Date());

const STATUS_TONE = {
  confirmed: 'pill-info', checked_in: 'pill-ok', checked_out: 'bg-stone/10 text-stone',
  cancelled: 'pill-danger', no_show: 'pill-warn',
};
const STATUS_LABEL = {
  confirmed: 'Confirmed', checked_in: 'In house', checked_out: 'Checked out',
  cancelled: 'Cancelled', no_show: 'No-show',
};
const ACTIVE = ['confirmed', 'checked_in'];
const emptyForm = {
  unit_id: '', guest_tenant_id: '', guest_name: '', guest_contact: '',
  check_in: TODAY, check_out: addDays(TODAY, 1), nightly_rate: '', notes: '',
  // Guest register / tourist details (optional).
  guests_count: '', nationality: '', id_type: '', id_number: '',
  purpose_of_visit: '', arriving_from: '', next_destination: '',
};

const ID_TYPES = [['', 'ID type…'], ['passport', 'Passport'], ['ghana_card', 'Ghana Card'], ['drivers_license', "Driver's licence"], ['other', 'Other']];
const PURPOSES = [['', 'Reason for visit…'], ['leisure', 'Leisure / tourism'], ['business', 'Business'], ['other', 'Other']];
const PURPOSE_LABEL = { leisure: 'Leisure', business: 'Business', other: 'Other' };

// Builds a CSV of the guest register and triggers a download. This is what a
// property shares with a tourism board — one row per stay, with the standard
// arrival questions alongside the booking.
function exportGuestRegister(rows, roomLabel) {
  const cols = [
    ['Guest', (r) => r.guest_display],
    ['Room', (r) => r.unit_code || roomLabel(r.unit_id)],
    ['Check-in', (r) => r.check_in],
    ['Check-out', (r) => r.check_out],
    ['Guests', (r) => r.guests_count ?? ''],
    ['Nationality', (r) => r.nationality || ''],
    ['ID type', (r) => r.id_type || ''],
    ['ID number', (r) => r.id_number || ''],
    ['Purpose of visit', (r) => r.purpose_of_visit || ''],
    ['Arriving from', (r) => r.arriving_from || ''],
    ['Next destination', (r) => r.next_destination || ''],
    ['Contact', (r) => r.guest_contact || ''],
    ['Status', (r) => r.status],
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => esc(c[0])).join(',')];
  rows.forEach((r) => lines.push(cols.map((c) => esc(c[1](r))).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `guest-register-${TODAY}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reservations() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const [rooms, setRooms] = useState([]);
  const [guests, setGuests] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [avail, setAvail] = useState(null); // { available, checking }

  const loadReservations = () => getReservations().then(setReservations).catch((e) => setError(readApiError(e, 'load reservations')));

  useEffect(() => {
    getUnits().then(setRooms).catch(() => setRooms([]));
    getTenants().then(setGuests).catch(() => setGuests([]));
    loadReservations();
  }, []);

  const roomLabel = (id) => rooms.find((r) => r.id === id)?.unit_code || id;

  // Live availability as the room/dates change.
  useEffect(() => {
    const { unit_id, check_in, check_out } = form;
    if (!showForm || !unit_id || !check_in || !check_out || check_out <= check_in) { setAvail(null); return; }
    let cancelled = false;
    setAvail({ checking: true });
    checkAvailability({ unit_id, check_in, check_out })
      .then((r) => { if (!cancelled) setAvail({ available: r.available }); })
      .catch(() => { if (!cancelled) setAvail(null); });
    return () => { cancelled = true; };
  }, [showForm, form.unit_id, form.check_in, form.check_out]);

  const openNew = () => { setForm(emptyForm); setAvail(null); setError(''); setShowForm(true); };

  const pickRoom = (id) => {
    const r = rooms.find((x) => x.id === id);
    setForm((f) => ({ ...f, unit_id: id, nightly_rate: f.nightly_rate || (r?.base_rate_short ?? '') }));
  };
  const pickGuest = (id) => {
    const g = guests.find((x) => x.id === id);
    setForm((f) => ({ ...f, guest_tenant_id: id, guest_name: g ? `${g.first_name} ${g.last_name}`.trim() : f.guest_name }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      await createReservation(form);
      setShowForm(false); setForm(emptyForm);
      loadReservations();
    } catch (err) {
      setError(readApiError(err, 'save that reservation'));
    } finally { setSaving(false); }
  };

  const setStatus = async (id, status) => {
    setError(''); setBusyId(id);
    try { await updateReservation(id, { status }); loadReservations(); }
    catch (err) { setError(readApiError(err, 'update that reservation')); }
    finally { setBusyId(null); }
  };
  const remove = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteReservation(id); loadReservations(); }
    catch (err) { setError(readApiError(err, 'delete that reservation')); }
    finally { setBusyId(null); }
  };

  // ---- derived ----
  const coversToday = (r) => ACTIVE.includes(r.status) && r.check_in <= TODAY && r.check_out > TODAY;
  const arrivalsToday = reservations.filter((r) => r.status === 'confirmed' && r.check_in === TODAY).length;
  const inHouse = reservations.filter((r) => r.status === 'checked_in').length;
  const occupiedTonight = reservations.filter(coversToday).length;
  const occupancy = rooms.length ? Math.round((occupiedTonight / rooms.length) * 100) : 0;

  const upcoming = reservations.filter((r) => r.status === 'confirmed' && r.check_out >= TODAY)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  const house = reservations.filter((r) => r.status === 'checked_in')
    .sort((a, b) => a.check_out.localeCompare(b.check_out));
  const past = reservations.filter((r) => !['confirmed', 'checked_in'].includes(r.status) || (r.status === 'confirmed' && r.check_out < TODAY))
    .sort((a, b) => b.check_in.localeCompare(a.check_in)).slice(0, 20);

  // 14-day calendar window.
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(TODAY, i)), []);
  const cellRes = (roomId, day) => reservations.find((r) => r.unit_id === roomId && ACTIVE.includes(r.status) && r.check_in <= day && r.check_out > day);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="text-stone text-sm">Bookings, arrivals and room availability — at a glance.</p>
        {reservations.length > 0 && (
          <button onClick={() => exportGuestRegister([...house, ...upcoming, ...past], roomLabel)}
            title="Download the guest register as a CSV — ready to share with a tourism board"
            className="lx-btn-ghost text-xs shrink-0 whitespace-nowrap">Export guest register</button>
        )}
      </div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Rooms" value={rooms.length} icon={IconBuilding} sub="In your hotel" />
        <StatCard label="Arrivals today" value={arrivalsToday} icon={IconCalendar} sub="Due to check in" />
        <StatCard label="In house" value={inHouse} icon={IconUsers} sub="Checked-in guests" />
        <StatCard label="Occupied tonight" value={`${occupancy}%`} icon={IconHome} sub={`${occupiedTonight} of ${rooms.length} rooms`} />
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif text-xl text-ink">Next 14 days</h2>
        {canEdit && <button onClick={openNew} className="lx-btn-primary !py-2 text-xs shrink-0">+ New reservation</button>}
      </div>

      {/* Availability calendar */}
      {rooms.length > 0 ? (
        <div className="lx-card overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-card z-10 text-left px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-stone">Room</th>
                  {days.map((d) => {
                    const dt = new Date(d + 'T00:00:00');
                    return (
                      <th key={d} className={`px-1 py-2 text-center text-[10px] font-medium ${d === TODAY ? 'text-gold' : 'text-stone'}`}>
                        <div>{dt.toLocaleDateString(undefined, { weekday: 'short' })[0]}</div>
                        <div className="text-ink/70">{dt.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="border-t border-line/70">
                    <td className="sticky left-0 bg-card z-10 px-4 py-2 text-sm font-medium text-ink whitespace-nowrap">Room {room.unit_code}</td>
                    {days.map((d) => {
                      const r = cellRes(room.id, d);
                      const isStart = r && r.check_in === d;
                      return (
                        <td key={d} className="px-0.5 py-1.5 align-middle">
                          <div
                            title={r ? `${r.guest_display} · ${r.check_in}→${r.check_out}` : 'Free'}
                            className={`h-6 rounded-md flex items-center justify-start px-1 overflow-hidden ${
                              r ? (r.status === 'checked_in' ? 'bg-gold text-white' : 'bg-[#475569] text-white') : 'bg-panel'
                            }`}
                          >
                            {isStart && <span className="text-[9px] truncate leading-none">{r.guest_display}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="lx-card p-8 text-center text-stone text-sm mb-8">
          Add rooms first, then you can take reservations. <a href="/rooms" className="text-gold hover:underline">Go to Rooms →</a>
        </div>
      )}

      {/* Lists */}
      <ResGroup title="In house" rows={house} empty="No one is checked in right now."
        money={money} roomLabel={roomLabel} canEdit={canEdit} busyId={busyId} setStatus={setStatus} remove={remove} />
      <ResGroup title="Arrivals & upcoming" rows={upcoming} empty="No upcoming bookings."
        money={money} roomLabel={roomLabel} canEdit={canEdit} busyId={busyId} setStatus={setStatus} remove={remove} />
      {past.length > 0 && (
        <ResGroup title="Past & cancelled" rows={past} empty=""
          money={money} roomLabel={roomLabel} canEdit={canEdit} busyId={busyId} setStatus={setStatus} remove={remove} />
      )}

      {/* New reservation modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-ink/50" />
          <div className="relative bg-card w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-lift p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-serif text-xl text-ink">New reservation</h3>
              <button onClick={() => setShowForm(false)} aria-label="Close" className="text-stone hover:text-ink text-xl leading-none -mt-1">×</button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Room" required>
                <select required className="lx-select" value={form.unit_id} onChange={(e) => pickRoom(e.target.value)}>
                  <option value="">Select room…</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.unit_code}{r.base_rate_short ? ` · ${money(r.base_rate_short)}/night` : ''}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Check-in" required>
                  <input type="date" required className="lx-input" value={form.check_in}
                    onChange={(e) => setForm({ ...form, check_in: e.target.value, check_out: form.check_out <= e.target.value ? addDays(e.target.value, 1) : form.check_out })} />
                </Field>
                <Field label="Check-out" required>
                  <input type="date" required className="lx-input" min={addDays(form.check_in, 1)} value={form.check_out}
                    onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
                </Field>
              </div>
              {avail && (
                <p className={`text-xs ${avail.checking ? 'text-stone' : avail.available ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {avail.checking ? 'Checking availability…' : avail.available ? '✓ Room is free for these dates' : '✗ That room is already booked for those dates'}
                </p>
              )}
              {guests.length > 0 && (
                <Field label="Existing guest" hint="Optional — or just type a name below.">
                  <select className="lx-select" value={form.guest_tenant_id} onChange={(e) => pickGuest(e.target.value)}>
                    <option value="">Walk-in / new guest</option>
                    {guests.map((g) => <option key={g.id} value={g.id}>{g.first_name} {g.last_name}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Guest name" value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value, guest_tenant_id: '' })} />
                <TextField label="Contact" hint="Phone or email" value={form.guest_contact} onChange={(e) => setForm({ ...form, guest_contact: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Nightly rate" type="number" value={form.nightly_rate} onChange={(e) => setForm({ ...form, nightly_rate: e.target.value })} />
                <div>
                  <span className="lx-label">Total</span>
                  <div className="lx-input bg-panel/60 flex items-center">
                    {form.nightly_rate && form.check_in && form.check_out
                      ? `${money(Number(form.nightly_rate) * nightsBetween(form.check_in, form.check_out))} · ${nightsBetween(form.check_in, form.check_out)} night${nightsBetween(form.check_in, form.check_out) === 1 ? '' : 's'}`
                      : '—'}
                  </div>
                </div>
              </div>
              <TextField label="Notes" hint="Optional" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

              {/* Guest register — the standard arrival questions, kept per stay
                  so the data can later be exported for a tourism board. All
                  optional, so a quick walk-in booking stays quick. */}
              <details className="rounded-xl border border-line/80 bg-panel/40 px-3.5 py-3">
                <summary className="text-sm font-medium text-ink cursor-pointer select-none">Guest &amp; travel details <span className="text-xs text-stone font-normal">· optional, for your register</span></summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Number of guests" type="number" min="1" value={form.guests_count} onChange={(e) => setForm({ ...form, guests_count: e.target.value })} />
                    <TextField label="Nationality" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ID type">
                      <select className="lx-select" value={form.id_type} onChange={(e) => setForm({ ...form, id_type: e.target.value })}>
                        {ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <TextField label="ID number" value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} />
                  </div>
                  <Field label="Reason for visit">
                    <select className="lx-select" value={form.purpose_of_visit} onChange={(e) => setForm({ ...form, purpose_of_visit: e.target.value })}>
                      {PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Arriving from" hint="City / country" value={form.arriving_from} onChange={(e) => setForm({ ...form, arriving_from: e.target.value })} />
                    <TextField label="Next destination" hint="Optional" value={form.next_destination} onChange={(e) => setForm({ ...form, next_destination: e.target.value })} />
                  </div>
                </div>
              </details>

              <div className="flex gap-3 pt-1">
                <button disabled={saving || (avail && avail.available === false)} className="lx-btn-gold">
                  {saving ? 'Saving…' : 'Create reservation'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="lx-btn-ghost">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ResGroup({ title, rows, empty, money, roomLabel, canEdit, busyId, setStatus, remove }) {
  return (
    <div className="mb-6">
      <h2 className="font-serif text-xl text-ink mb-3">{title} {rows.length > 0 && <span className="text-sm text-stone font-sans">· {rows.length}</span>}</h2>
      {rows.length === 0 ? (
        empty ? <p className="text-stone text-sm">{empty}</p> : null
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const nights = nightsBetween(r.check_in, r.check_out);
            return (
              <div key={r.id} className="lx-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink">{r.guest_display}</span>
                      <span className={`pill capitalize ${STATUS_TONE[r.status] || 'bg-stone/10 text-stone'}`}>{STATUS_LABEL[r.status] || r.status}</span>
                    </div>
                    <div className="text-xs text-stone mt-1">
                      Room {r.unit_code || roomLabel(r.unit_id)} · {r.check_in} → {r.check_out} · {nights} night{nights === 1 ? '' : 's'}
                      {r.nightly_rate ? ` · ${money(r.nightly_rate * nights)}` : ''}
                      {r.guest_contact ? ` · ${r.guest_contact}` : ''}
                    </div>
                    {r.notes && <div className="text-xs text-stone/90 mt-1">{r.notes}</div>}
                    {(r.guests_count || r.nationality || r.purpose_of_visit) && (
                      <div className="text-[11px] text-stone/80 mt-1">
                        {[
                          r.guests_count ? `${r.guests_count} guest${Number(r.guests_count) === 1 ? '' : 's'}` : null,
                          r.nationality || null,
                          r.purpose_of_visit ? (PURPOSE_LABEL[r.purpose_of_visit] || r.purpose_of_visit) : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      {r.status === 'confirmed' && (
                        <button disabled={busyId === r.id} onClick={() => setStatus(r.id, 'checked_in')} className="lx-btn-gold !py-1.5 !px-3 text-xs">Check in</button>
                      )}
                      {r.status === 'checked_in' && (
                        <button disabled={busyId === r.id} onClick={() => setStatus(r.id, 'checked_out')} className="lx-btn-primary !py-1.5 !px-3 text-xs">Check out</button>
                      )}
                      {r.status === 'confirmed' && (
                        <button disabled={busyId === r.id} onClick={() => setStatus(r.id, 'cancelled')} className="text-xs text-stone hover:text-rose-600 px-1">Cancel</button>
                      )}
                      <RowActions onDelete={() => remove(r.id)} busy={busyId === r.id} deleteLabel="Delete this reservation?" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
