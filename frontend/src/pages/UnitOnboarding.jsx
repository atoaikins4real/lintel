import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { createUnit, getUnit, updateUnit, getProperties, readApiError } from '../api/client.js';
import PhotoUploader from '../components/PhotoUploader.jsx';
import { StepChips, WizardStep, NumField, ComboField, ChipGroup } from '../components/WizardShell.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import {
  UNIT_TYPES, UNIT_CLASSES, FURNISHING, UNIT_FEATURES, STAIRCASE_TYPES,
  GLASS_PANEL_TYPES, WOOD_COLOURS, JOINERY_MATERIALS, FLOORING_TYPES, CEILING_TYPES,
} from '../data/specs.js';

const STEPS = ['Basics', 'Layout', 'Size', 'Finishes', 'Features', 'Pricing', 'Photos', 'Review'];

const empty = {
  property_id: '', unit_code: '', unit_type: 'apartment', class: 'standard',
  description: '', status: 'vacant',
  bedrooms: '', bathrooms: '', ensuite_bathrooms: '', halls: '', kitchens: '',
  rooms: '', balconies: '', store_rooms: '', staircases: '', storeys: '',
  floor_area: '', floor_area_unit: 'sqm', floor_number: '',
  glass_panel_type: '', wood_colour: '', joinery_material: '',
  flooring_type: '', ceiling_type: '', wall_colour: '', view_orientation: '',
  furnishing: '', has_air_conditioning: false, features: [],
  base_rate_short: '', base_rate_long: '',
  listing_type: 'rent', sale_price: '', sale_status: 'available',
  photo_urls: [], photo_url: '', city: '',
};

// Guided apartment intake. Created at step one so the record survives if
// the user steps away mid-entry.
export default function UnitOnboarding() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currency } = useSettings();

  const [unitId, setUnitId] = useState(routeId || null);
  const [step, setStep] = useState(0);
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState({ ...empty, property_id: searchParams.get('property') || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProperties().then(setProperties).catch(() => {});
  }, []);

  useEffect(() => {
    if (!routeId) return;
    getUnit(routeId)
      .then((u) => setForm({ ...empty, ...u, features: u.features || [], photo_urls: u.photo_urls || [] }))
      .catch((err) => setError(readApiError(err, 'load this unit')));
  }, [routeId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleFeature = (v) =>
    setForm((f) => ({
      ...f,
      features: f.features.includes(v) ? f.features.filter((x) => x !== v) : [...f.features, v],
    }));

  const saveAndGo = async (nextStep) => {
    setError('');
    setSaving(true);
    try {
      if (!unitId) {
        const created = await createUnit(form);
        setUnitId(created.id);
      } else {
        await updateUnit(unitId, form);
      }
      setStep(nextStep);
    } catch (err) {
      setError(readApiError(err, 'save this unit'));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setError('');
    setSaving(true);
    try {
      if (unitId) await updateUnit(unitId, form);
      navigate(`/units/${unitId}`);
    } catch (err) {
      setError(readApiError(err, 'save this unit'));
    } finally {
      setSaving(false);
    }
  };

  if (properties.length === 0) {
    return (
      <div className="max-w-xl text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        Every apartment belongs to a property, and you don&apos;t have one yet.{' '}
        <Link to="/properties/onboard" className="underline font-medium">Add a property first</Link>.
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <StepChips steps={STEPS} step={step} setStep={setStep} unlocked={Boolean(unitId)} />

      {unitId && <p className="text-xs text-stone mb-4">Saved — you can leave and come back to finish this.</p>}
      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {step === 0 && (
        <WizardStep
          title="Which apartment?"
          hint="Pick the property it sits in and give it a reference."
          onNext={() => saveAndGo(1)} busy={saving}
          canNext={Boolean(form.property_id && form.unit_code.trim())}
          nextLabel={unitId ? 'Save & continue' : 'Create & continue'}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-stone mb-1">Property</label>
              <select className="lx-select" value={form.property_id}
                onChange={(e) => set({ property_id: e.target.value })}>
                <option value="">Select property…</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <input className="lx-input sm:col-span-2" placeholder="Unit reference (e.g. Block A - 4B)"
              value={form.unit_code} onChange={(e) => set({ unit_code: e.target.value })} />
            <div>
              <label className="block text-xs text-stone mb-1">Type</label>
              <select className="lx-select" value={form.unit_type} onChange={(e) => set({ unit_type: e.target.value })}>
                {UNIT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone mb-1">Class</label>
              <select className="lx-select" value={form.class} onChange={(e) => set({ class: e.target.value })}>
                {UNIT_CLASSES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
          </div>
          <textarea className="lx-input" rows={3}
            placeholder="Description — this is what prospects read on your shared link"
            value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </WizardStep>
      )}

      {step === 1 && (
        <WizardStep title="Layout" hint="How many of each room. Leave blank if it doesn't apply."
          onBack={() => setStep(0)} onNext={() => saveAndGo(2)} busy={saving}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumField label="Bedrooms" value={form.bedrooms} onChange={(v) => set({ bedrooms: v })} />
            <NumField label="Bathrooms" value={form.bathrooms} onChange={(v) => set({ bathrooms: v })} />
            <NumField label="En-suites" value={form.ensuite_bathrooms} onChange={(v) => set({ ensuite_bathrooms: v })} />
            <NumField label="Halls / living" value={form.halls} onChange={(v) => set({ halls: v })} />
            <NumField label="Kitchens" value={form.kitchens} onChange={(v) => set({ kitchens: v })} />
            <NumField label="Balconies" value={form.balconies} onChange={(v) => set({ balconies: v })} />
            <NumField label="Store rooms" value={form.store_rooms} onChange={(v) => set({ store_rooms: v })} />
            <NumField label="Total rooms" value={form.rooms} onChange={(v) => set({ rooms: v })} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            <NumField label="Storeys (1 = flat, 2 = duplex)" value={form.storeys} onChange={(v) => set({ storeys: v })} />
            <NumField label="Internal staircases" value={form.staircases} onChange={(v) => set({ staircases: v })} />
            <NumField label="Floor number" value={form.floor_number} onChange={(v) => set({ floor_number: v })} />
          </div>
        </WizardStep>
      )}

      {step === 2 && (
        <WizardStep title="Size" hint="Floor area as advertised."
          onBack={() => setStep(1)} onNext={() => saveAndGo(3)} busy={saving}>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <NumField label="Floor area" value={form.floor_area} onChange={(v) => set({ floor_area: v })} placeholder="e.g. 120" />
            <div>
              <label className="block text-xs text-stone mb-1">Unit</label>
              <select className="lx-select" value={form.floor_area_unit}
                onChange={(e) => set({ floor_area_unit: e.target.value })}>
                <option value="sqm">sqm</option>
                <option value="sqft">sqft</option>
              </select>
            </div>
          </div>
        </WizardStep>
      )}

      {step === 3 && (
        <WizardStep title="Finishes & fittings" hint="Pick from the list or type your own."
          onBack={() => setStep(2)} onNext={() => saveAndGo(4)} busy={saving}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComboField label="Flooring" value={form.flooring_type}
              onChange={(v) => set({ flooring_type: v })} options={FLOORING_TYPES} />
            <ComboField label="Ceiling" value={form.ceiling_type}
              onChange={(v) => set({ ceiling_type: v })} options={CEILING_TYPES} />
            <ComboField label="Wood colour" value={form.wood_colour}
              onChange={(v) => set({ wood_colour: v })} options={WOOD_COLOURS} />
            <ComboField label="Joinery material" value={form.joinery_material}
              onChange={(v) => set({ joinery_material: v })} options={JOINERY_MATERIALS} />
            <ComboField label="Glass panels" value={form.glass_panel_type}
              onChange={(v) => set({ glass_panel_type: v })} options={GLASS_PANEL_TYPES} />
            <ComboField label="Wall colour" value={form.wall_colour}
              onChange={(v) => set({ wall_colour: v })} options={['White', 'Off-white', 'Grey', 'Beige', 'Cream']} />
            <ComboField label="Outlook / view" value={form.view_orientation}
              onChange={(v) => set({ view_orientation: v })}
              options={['Sea view', 'Garden facing', 'Street facing', 'Courtyard', 'City view', 'Pool view']} />
            <div>
              <label className="block text-xs text-stone mb-1">Furnishing</label>
              <select className="lx-select" value={form.furnishing}
                onChange={(e) => set({ furnishing: e.target.value })}>
                {FURNISHING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone">
            <input type="checkbox" className="rounded border-line accent-ink"
              checked={form.has_air_conditioning}
              onChange={(e) => set({ has_air_conditioning: e.target.checked })} />
            Air conditioning fitted
          </label>
        </WizardStep>
      )}

      {step === 4 && (
        <WizardStep title="Features" hint="Extras worth advertising."
          onBack={() => setStep(3)} onNext={() => saveAndGo(5)} busy={saving}>
          <ChipGroup options={UNIT_FEATURES} selected={form.features} onToggle={toggleFeature} />
        </WizardStep>
      )}

      {step === 5 && (
        <WizardStep title="Pricing & availability" hint={`Amounts are in ${currency}.`}
          onBack={() => setStep(4)} onNext={() => saveAndGo(6)} busy={saving}>
          <div>
            <label className="block text-xs text-stone mb-1.5">This apartment is offered for</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'rent', label: 'Rent only' },
                { value: 'sale', label: 'Sale only' },
                { value: 'both', label: 'Rent or sale' },
              ].map((o) => (
                <button
                  key={o.value} type="button" onClick={() => set({ listing_type: o.value })}
                  className={`px-4 py-2 rounded-xl text-sm border transition ${
                    form.listing_type === o.value
                      ? 'border-gold bg-gold/10 text-ink font-medium'
                      : 'border-line text-stone hover:border-stone/40'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {form.listing_type !== 'sale' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumField label={`Nightly rate (${currency})`} value={form.base_rate_short}
                onChange={(v) => set({ base_rate_short: v })} />
              <NumField label={`Monthly rate (${currency})`} value={form.base_rate_long}
                onChange={(v) => set({ base_rate_long: v })} />
            </div>
          )}

          {form.listing_type !== 'rent' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumField label={`Asking price (${currency})`} value={form.sale_price}
                onChange={(v) => set({ sale_price: v })} placeholder="e.g. 950000" />
              <div>
                <label className="block text-xs text-stone mb-1">Sale status</label>
                <select className="lx-select" value={form.sale_status}
                  onChange={(e) => set({ sale_status: e.target.value })}>
                  <option value="available">Available</option>
                  <option value="under_offer">Under offer</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
            </div>
          )}

          <div className="sm:max-w-xs">
            <label className="block text-xs text-stone mb-1">Occupancy status</label>
            <select className="lx-select" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
              <option value="off_market">Off market (hidden from showcase)</option>
            </select>
          </div>
        </WizardStep>
      )}

      {step === 6 && (
        <WizardStep title="Photos" hint="These become the slideshow prospects swipe through."
          onBack={() => setStep(5)} onNext={() => saveAndGo(7)} busy={saving}>
          <PhotoUploader
            onUploaded={(urls) =>
              set({ photo_urls: [...form.photo_urls, ...urls], photo_url: form.photo_url || urls[0] })
            }
          />
          {form.photo_urls.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {form.photo_urls.map((url) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-line">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button type="button"
                    onClick={() => set({ photo_urls: form.photo_urls.filter((u) => u !== url) })}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </WizardStep>
      )}

      {step === 7 && (
        <WizardStep title="Review" hint="This is roughly what a prospect will see."
          onBack={() => setStep(6)} onNext={finish} busy={saving} nextLabel="Finish">
          <Row label="Property" value={properties.find((p) => p.id === form.property_id)?.name} />
          <Row label="Reference" value={form.unit_code} />
          <Row label="Layout" value={[
            form.bedrooms && `${form.bedrooms} bed`,
            form.bathrooms && `${form.bathrooms} bath`,
            form.halls && `${form.halls} hall`,
            form.kitchens && `${form.kitchens} kitchen`,
          ].filter(Boolean).join(' · ')} />
          <Row label="Size" value={form.floor_area ? `${form.floor_area} ${form.floor_area_unit}` : ''} />
          <Row label="Finishes" value={[form.flooring_type, form.ceiling_type, form.wood_colour, form.glass_panel_type].filter(Boolean).join(' · ')} />
          <Row label="Features" value={form.features.join(', ')} />
          <Row label="Offered for" value={
            { rent: 'Rent only', sale: 'Sale only', both: 'Rent or sale' }[form.listing_type]
          } />
          <Row label="Pricing" value={[
            form.listing_type !== 'sale' && form.base_rate_short && `${form.base_rate_short}/night`,
            form.listing_type !== 'sale' && form.base_rate_long && `${form.base_rate_long}/mo`,
            form.listing_type !== 'rent' && form.sale_price && `${form.sale_price} asking`,
          ].filter(Boolean).join(' · ')} />
          <Row label="Photos" value={`${form.photo_urls.length} uploaded`} />
        </WizardStep>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start gap-3 text-sm border-b border-line/70 pb-2.5 last:border-0">
      <span className="text-stone w-40 shrink-0">{label}</span>
      <span className={value ? 'text-ink' : 'text-stone-light'}>{value || 'Not provided'}</span>
    </div>
  );
}
