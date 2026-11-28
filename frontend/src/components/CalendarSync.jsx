import { useEffect, useState } from 'react';
import { getCalendarSync, addCalendarFeed, deleteCalendarFeed, syncCalendarFeed, readApiError } from '../api/client.js';
import { TextField } from './Field.jsx';
import RowActions from './RowActions.jsx';
import { IconCalendar } from './icons.jsx';

const apiBase = import.meta.env.VITE_API_URL || '';
function backendOrigin() {
  try { return new URL(apiBase, window.location.origin).origin; } catch { return window.location.origin; }
}
const fmt = (d) => { try { return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return d; } };

// OTA calendar sync for a listing. Import Airbnb / Booking.com busy dates (so
// the listing can't be double-booked), and share Lintel's own calendar back.
export default function CalendarSync({ unitId, canEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ name: '', url: '' });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => getCalendarSync(unitId).then(setData).catch((e) => setError(readApiError(e, 'load calendar sync')));
  useEffect(() => { if (unitId) load(); /* eslint-disable-next-line */ }, [unitId]);

  const exportUrl = data?.export_path ? backendOrigin() + data.export_path : '';

  const add = async (e) => {
    e.preventDefault();
    if (!draft.url.trim()) return;
    setBusy('add'); setError('');
    try { await addCalendarFeed({ unit_id: unitId, name: draft.name, url: draft.url }); setDraft({ name: '', url: '' }); setAdding(false); await load(); }
    catch (err) { setError(readApiError(err, 'add that calendar')); }
    finally { setBusy(null); }
  };
  const sync = async (id) => {
    setBusy(id); setError('');
    try { const r = await syncCalendarFeed(id); if (r && r.synced === false) setError(r.status || 'Sync failed'); await load(); }
    catch (err) { setError(readApiError(err, 'sync that calendar')); }
    finally { setBusy(null); }
  };
  const remove = async (id) => {
    setBusy(id); setError('');
    try { await deleteCalendarFeed(id); await load(); }
    catch (err) { setError(readApiError(err, 'remove that calendar')); }
    finally { setBusy(null); }
  };
  const copy = () => { try { navigator.clipboard?.writeText(exportUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be blocked */ } };

  const feeds = data?.feeds || [];

  return (
    <section className="lx-card p-5 sm:p-6 mb-6">
      <h2 className="font-serif text-lg text-ink flex items-center gap-2 mb-1"><IconCalendar width={18} height={18} className="text-gold" /> Calendar sync</h2>
      <p className="text-xs text-stone mb-4">
        Keep this listing in step with Airbnb, Booking.com and other sites so it’s never double-booked.
        Import their calendars below, and give them Lintel’s link so your Lintel bookings show as busy there too.
      </p>

      {error && <div className="mb-4 lx-alert lx-alert-danger">{error}</div>}

      {/* Export: Lintel's calendar for the OTAs to subscribe to. */}
      <div className="rounded-xl border border-line/70 bg-panel/40 p-4 mb-4">
        <div className="lx-eyebrow text-stone mb-1.5">Your Lintel calendar link</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input readOnly value={exportUrl} className="lx-input flex-1 min-w-[200px] text-xs" onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copy} className="lx-btn-ghost text-sm px-3 py-2 shrink-0">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="text-[11px] text-stone mt-1.5">Paste this into Airbnb/Booking.com “import calendar”. It shares only booked dates — no guest or price details.</p>
      </div>

      {/* Import: external feeds. */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="lx-eyebrow text-stone">Imported calendars</div>
        {canEdit && (
          <button type="button" onClick={() => setAdding((s) => !s)} className="lx-btn-ghost text-xs px-3 py-1.5">{adding ? 'Cancel' : '+ Add calendar'}</button>
        )}
      </div>

      {canEdit && adding && (
        <form onSubmit={add} className="rounded-xl border border-line/70 bg-panel/40 p-4 mb-3 grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
          <TextField label="Name" hint="e.g. Airbnb" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <TextField label="Calendar (.ics) link" placeholder="https://…" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          <button disabled={busy === 'add'} className="lx-btn-primary text-sm">{busy === 'add' ? 'Adding…' : 'Add'}</button>
        </form>
      )}

      {feeds.length === 0 ? (
        <p className="text-sm text-stone">No external calendars yet{canEdit ? ' — add one to pull in bookings from other sites.' : '.'}</p>
      ) : (
        <ul className="space-y-2">
          {feeds.map((f) => {
            const err = f.last_status && f.last_status.startsWith('error');
            return (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{f.name || 'Calendar'}<span className="ml-2 text-xs text-stone">{f.block_count || 0} dates</span></div>
                  <div className="text-xs text-stone truncate">{f.url}</div>
                  <div className={`text-[11px] mt-0.5 ${err ? 'text-rose-600' : 'text-stone'}`}>
                    {f.last_synced_at ? `Synced ${fmt(f.last_synced_at)}${err ? ` · ${f.last_status}` : ''}` : 'Not synced yet'}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" disabled={busy === f.id} onClick={() => sync(f.id)} className="lx-btn-ghost text-xs px-3 py-1.5">{busy === f.id ? 'Syncing…' : 'Sync'}</button>
                    <RowActions onDelete={() => remove(f.id)} busy={busy === f.id} deleteLabel={`Remove ${f.name || 'this calendar'}?`} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
