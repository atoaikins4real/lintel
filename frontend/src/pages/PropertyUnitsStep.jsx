// The final stage of the unified "add a property" flow: capture the unit(s)
// that live inside the property just created, without leaving the wizard.
//
// It doesn't merge property and unit — units stay their own records (leases,
// payments, reports and the showcase all still hang off them). It just moves
// the moment of creating them into the same flow, so a subscriber fills in
// one continuous form instead of finishing the property wizard and then
// hunting for a separate "add unit" screen.
//
//   Single  — one standalone unit (a house/villa/shop). One inline form;
//             Finish creates it and opens the property.
//   Multiple — a building with several units. Add them one at a time; each
//             is saved as you go, so nothing is lost, then Finish.
import { useState } from 'react';
import { createUnit, readApiError } from '../api/client.js';
import UnitFields, { EMPTY_UNIT } from '../components/UnitFields.jsx';

export default function PropertyUnitsStep({ propertyId, propertyName, currency, onBack, onFinish }) {
  const [mode, setMode] = useState('single');
  const [draft, setDraft] = useState({ ...EMPTY_UNIT, unit_code: propertyName || '' });
  const [created, setCreated] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleFeature = (v) =>
    setDraft((d) => ({
      ...d,
      features: d.features.includes(v) ? d.features.filter((x) => x !== v) : [...d.features, v],
    }));

  const freshDraft = () => setDraft({ ...EMPTY_UNIT });

  // Creates the current draft as a unit under this property. Returns the
  // created row, or null on failure (error is surfaced).
  const saveDraft = async () => {
    setError('');
    setSaving(true);
    try {
      const unit = await createUnit({ ...draft, property_id: propertyId });
      setCreated((list) => [...list, unit]);
      return unit;
    } catch (err) {
      setError(readApiError(err, 'save this unit'));
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Single mode: create the one unit (if named) then leave.
  const finishSingle = async () => {
    if (draft.unit_code.trim()) {
      const unit = await saveDraft();
      if (!unit) return; // stay so they can fix the error
    }
    onFinish();
  };

  // Multiple mode: create the draft and reset for the next one.
  const addAnother = async () => {
    if (!draft.unit_code.trim()) {
      setError('Give the unit a reference before adding it.');
      return;
    }
    const unit = await saveDraft();
    if (unit) freshDraft();
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    // Moving to single, seed the reference from the property name for the
    // common "the house IS the unit" case; moving to multiple, start blank.
    setDraft(next === 'single' ? { ...EMPTY_UNIT, unit_code: propertyName || '' } : { ...EMPTY_UNIT });
  };

  return (
    <section className="lx-card p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="font-serif text-lg text-ink">Add the unit{mode === 'multi' ? 's' : ''}</h2>
        <p className="text-xs text-stone">
          A property holds one or more rentable units. Add them here — you can always add more later from the
          property page.
        </p>
      </div>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {/* Single vs multiple */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'single', label: 'One standalone unit (a house)' },
          { value: 'multi', label: 'Several units (a block/estate)' },
        ].map((o) => (
          <button
            key={o.value} type="button" onClick={() => switchMode(o.value)}
            className={`px-4 py-2 rounded-xl text-sm border transition ${
              mode === o.value
                ? 'border-gold bg-gold/10 text-ink font-medium'
                : 'border-line text-stone hover:border-stone/40'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Already-added units (multiple mode) */}
      {created.length > 0 && (
        <div className="rounded-xl bg-panel border border-line/70 px-4 py-3">
          <div className="lx-eyebrow mb-2">Added so far ({created.length})</div>
          <ul className="text-sm text-ink space-y-1">
            {created.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                {u.unit_code || 'Unit'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <UnitFields form={draft} set={set} toggleFeature={toggleFeature} currency={currency} />

      <div className="flex flex-wrap gap-2 pt-1 border-t border-line/70">
        <button type="button" onClick={onBack} className="lx-btn-ghost">Back</button>

        {mode === 'multi' ? (
          <>
            <button type="button" onClick={addAnother} disabled={saving} className="lx-btn-ghost">
              {saving ? 'Saving…' : 'Add this unit'}
            </button>
            <button type="button" onClick={onFinish} disabled={saving} className="lx-btn-primary ml-auto">
              {created.length > 0 ? `Finish (${created.length} added)` : 'Finish'}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onFinish} disabled={saving} className="lx-btn-ghost">
              Skip — add the unit later
            </button>
            <button type="button" onClick={finishSingle} disabled={saving} className="lx-btn-primary ml-auto">
              {saving ? 'Saving…' : 'Finish'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
