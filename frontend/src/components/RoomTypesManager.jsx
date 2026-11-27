import { useEffect, useState } from 'react';
import {
  getRoomTypes, createRoomType, updateRoomType, deleteRoomType,
  createRatePlan, deleteRatePlan, readApiError,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import Field, { TextField } from './Field.jsx';
import RowActions from './RowActions.jsx';
import { IconBuilding, IconWallet } from './icons.jsx';

const emptyType = { name: '', base_rate: '', capacity: '', description: '' };

// Hotel room types & rate plans. A type groups rooms that share a size and
// price; each type carries named rate plans (nightly prices) a booking can be
// made on. Managers edit; everyone else sees it read-only.
export default function RoomTypesManager() {
  const { isManager } = useAuth();
  const { money } = useSettings();
  const [types, setTypes] = useState([]);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(emptyType);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyType);
  const [busy, setBusy] = useState(null);

  const load = () => getRoomTypes().then(setTypes).catch((e) => setError(readApiError(e, 'load room types')));
  useEffect(() => { load(); }, []);

  const addType = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true); setError('');
    try { await createRoomType(draft); setDraft(emptyType); setShowNew(false); await load(); }
    catch (err) { setError(readApiError(err, 'add room type')); }
    finally { setSaving(false); }
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setEditDraft({ name: t.name || '', base_rate: t.base_rate ?? '', capacity: t.capacity ?? '', description: t.description || '' });
  };
  const saveEdit = async (id) => {
    setBusy(id); setError('');
    try { await updateRoomType(id, editDraft); setEditId(null); await load(); }
    catch (err) { setError(readApiError(err, 'save room type')); }
    finally { setBusy(null); }
  };
  const removeType = async (id) => {
    setBusy(id); setError('');
    try { await deleteRoomType(id); await load(); }
    catch (err) { setError(readApiError(err, 'remove room type')); }
    finally { setBusy(null); }
  };

  return (
    <section className="lx-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg text-ink">Room types &amp; rates</h2>
        {isManager && (
          <button type="button" onClick={() => setShowNew((s) => !s)} className="lx-btn-ghost text-sm px-3 py-1.5 shrink-0">
            {showNew ? 'Cancel' : '+ Add type'}
          </button>
        )}
      </div>
      <p className="text-xs text-stone mb-4">
        Group rooms that share a size and price (Standard, Deluxe, Suite…). Each type can carry several rate
        plans — named nightly prices like “Bed &amp; breakfast” or “Non-refundable” — that a reservation is booked on.
      </p>

      {error && <div className="mb-4 lx-alert lx-alert-danger">{error}</div>}

      {isManager && showNew && (
        <form onSubmit={addType} className="rounded-xl border border-line/70 bg-panel/40 p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField label="Type name" placeholder="e.g. Deluxe" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <TextField label="Base nightly rate" type="number" value={draft.base_rate} onChange={(e) => setDraft({ ...draft, base_rate: e.target.value })} />
          <TextField label="Sleeps" type="number" hint="Max guests" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
          <TextField label="Description" hint="Optional" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <button disabled={saving} className="lx-btn-primary text-sm sm:col-span-2 justify-self-start">
            {saving ? 'Adding…' : 'Add room type'}
          </button>
        </form>
      )}

      {types.length === 0 ? (
        <p className="text-sm text-stone">No room types yet. {isManager ? 'Add one to price rooms by type.' : ''}</p>
      ) : (
        <div className="space-y-3">
          {types.map((t) => (
            <div key={t.id} className="rounded-xl border border-line/70 p-4">
              {editId === t.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Type name" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
                  <TextField label="Base nightly rate" type="number" value={editDraft.base_rate} onChange={(e) => setEditDraft({ ...editDraft, base_rate: e.target.value })} />
                  <TextField label="Sleeps" type="number" value={editDraft.capacity} onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })} />
                  <TextField label="Description" value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} />
                  <div className="sm:col-span-2 flex gap-2">
                    <button type="button" disabled={busy === t.id} onClick={() => saveEdit(t.id)} className="lx-btn-primary text-sm px-4 py-1.5">Save</button>
                    <button type="button" onClick={() => setEditId(null)} className="lx-btn-ghost text-sm px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-8 h-8 rounded-lg bg-gold/12 text-gold flex items-center justify-center shrink-0"><IconBuilding width={16} height={16} /></span>
                        <span className="font-medium text-ink">{t.name}</span>
                        {t.capacity ? <span className="pill bg-stone/10 text-stone">Sleeps {t.capacity}</span> : null}
                        {t.base_rate != null ? <span className="text-xs text-stone">{money(t.base_rate)}/night base</span> : null}
                      </div>
                      {t.description && <p className="text-xs text-stone mt-1.5">{t.description}</p>}
                    </div>
                    {isManager && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => startEdit(t)} className="text-xs text-stone hover:text-gold px-2 py-1">Edit</button>
                        <RowActions onDelete={() => removeType(t.id)} busy={busy === t.id} deleteLabel={`Delete ${t.name}?`} />
                      </div>
                    )}
                  </div>
                  <RatePlans type={t} isManager={isManager} money={money} onChanged={load} setError={setError} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Rate plans under one type: a list plus an inline "add plan" row.
function RatePlans({ type, isManager, money, onChanged, setError }) {
  const plans = type.l_rate_plans || [];
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || price === '') return;
    setBusy(true); setError('');
    try { await createRatePlan(type.id, { name, price }); setName(''); setPrice(''); await onChanged(); }
    catch (err) { setError(readApiError(err, 'add rate plan')); }
    finally { setBusy(false); }
  };
  const remove = async (planId) => {
    setBusy(true); setError('');
    try { await deleteRatePlan(planId); await onChanged(); }
    catch (err) { setError(readApiError(err, 'remove rate plan')); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-line/60">
      <div className="lx-eyebrow text-stone mb-2 flex items-center gap-1.5"><IconWallet width={12} height={12} /> Rate plans</div>
      {plans.length === 0 && <p className="text-xs text-stone mb-2">No rate plans yet.</p>}
      <ul className="space-y-1.5 mb-2">
        {plans.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm bg-panel/50 rounded-lg px-3 py-2">
            <span className="min-w-0 truncate"><span className="text-ink font-medium">{p.name}</span>{p.notes ? <span className="text-stone"> · {p.notes}</span> : null}</span>
            <span className="flex items-center gap-3 shrink-0">
              <span className="text-ink">{money(p.price)}</span>
              {isManager && (
                <button type="button" disabled={busy} onClick={() => remove(p.id)} className="text-xs text-stone hover:text-rose-600">Remove</button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {isManager && (
        <div className="flex items-end gap-2 flex-wrap">
          <input className="lx-input flex-1 min-w-[120px]" placeholder="Plan name (e.g. B&B)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="lx-input w-28" type="number" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button type="button" disabled={busy} onClick={add} className="lx-btn-ghost text-sm px-3 py-2">Add plan</button>
        </div>
      )}
    </div>
  );
}
