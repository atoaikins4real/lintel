import { useEffect, useState } from 'react';
import { getRateOverrides, createRateOverride, deleteRateOverride, readApiError } from '../api/client.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { TextField } from './Field.jsx';
import RowActions from './RowActions.jsx';
import { IconCalendar } from './icons.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());
const fmt = (d) => { try { return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };
const empty = { label: '', start_date: TODAY, end_date: TODAY, nightly_rate: '', min_stay: '' };

// Seasonal pricing & minimum-stay for one listing. Add date ranges that beat
// the base nightly rate (peak, festive, low season) and/or require a minimum
// number of nights. The booking form uses these automatically.
export default function SeasonalRates({ unitId, canEdit }) {
  const { money } = useSettings();
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(empty);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const load = () => getRateOverrides({ unit_id: unitId }).then(setRows).catch((e) => setError(readApiError(e, 'load seasonal rates')));
  useEffect(() => { if (unitId) load(); /* eslint-disable-next-line */ }, [unitId]);

  const add = async (e) => {
    e.preventDefault();
    if (draft.end_date < draft.start_date) { setError('End date must be on or after the start date'); return; }
    if (draft.nightly_rate === '' && draft.min_stay === '') { setError('Set a nightly rate, a minimum stay, or both'); return; }
    setSaving(true); setError('');
    try { await createRateOverride({ ...draft, unit_id: unitId }); setDraft(empty); setShowNew(false); await load(); }
    catch (err) { setError(readApiError(err, 'add seasonal rate')); }
    finally { setSaving(false); }
  };
  const remove = async (id) => {
    setBusy(id); setError('');
    try { await deleteRateOverride(id); await load(); }
    catch (err) { setError(readApiError(err, 'remove seasonal rate')); }
    finally { setBusy(null); }
  };

  return (
    <section className="lx-card p-5 sm:p-6 mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg text-ink flex items-center gap-2"><IconCalendar width={18} height={18} className="text-gold" /> Seasonal rates</h2>
        {canEdit && (
          <button type="button" onClick={() => setShowNew((s) => !s)} className="lx-btn-ghost text-sm px-3 py-1.5 shrink-0">
            {showNew ? 'Cancel' : '+ Add rate'}
          </button>
        )}
      </div>
      <p className="text-xs text-stone mb-4">
        Charge more in peak or festive weeks, less in the low season, and require a minimum stay over busy
        dates. A booking that starts inside a range uses its rate and minimum-stay automatically.
      </p>

      {error && <div className="mb-4 lx-alert lx-alert-danger">{error}</div>}

      {canEdit && showNew && (
        <form onSubmit={add} className="rounded-xl border border-line/70 bg-panel/40 p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Label" hint="e.g. Festive peak" className="sm:col-span-2" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <TextField label="From" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
          <TextField label="To" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
          <TextField label="Nightly rate" type="number" hint="Optional" value={draft.nightly_rate} onChange={(e) => setDraft({ ...draft, nightly_rate: e.target.value })} />
          <TextField label="Minimum stay" type="number" hint="Nights — optional" value={draft.min_stay} onChange={(e) => setDraft({ ...draft, min_stay: e.target.value })} />
          <button disabled={saving} className="lx-btn-primary text-sm sm:col-span-2 justify-self-start">
            {saving ? 'Adding…' : 'Add seasonal rate'}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-stone">No seasonal rates — this listing uses its base nightly rate year-round.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const past = r.end_date < TODAY;
            return (
              <li key={r.id} className={`flex items-center justify-between gap-3 rounded-xl border border-line/70 px-4 py-3 ${past ? 'opacity-60' : ''}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {r.label || 'Seasonal rate'}
                    {past && <span className="ml-2 text-[10px] uppercase tracking-wide text-stone">past</span>}
                  </div>
                  <div className="text-xs text-stone">{fmt(r.start_date)} → {fmt(r.end_date)}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    {r.nightly_rate != null && <div className="text-sm text-ink">{money(r.nightly_rate)}/night</div>}
                    {r.min_stay ? <div className="text-xs text-stone">min {r.min_stay} night{r.min_stay === 1 ? '' : 's'}</div> : null}
                  </div>
                  {canEdit && <RowActions onDelete={() => remove(r.id)} busy={busy === r.id} deleteLabel="Remove this rate?" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
