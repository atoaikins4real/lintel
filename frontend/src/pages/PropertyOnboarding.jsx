import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createProperty, getProperty, updateProperty, readApiError } from '../api/client.js';
import PhotoUploader from '../components/PhotoUploader.jsx';
import { StepChips, WizardStep, NumField, ComboField, ChipGroup } from '../components/WizardShell.jsx';
import {
  PROPERTY_TYPES, AMENITIES, STAIRCASE_TYPES, GLASS_PANEL_TYPES,
  ROOFING_TYPES, WALL_MATERIALS, EXTERIOR_FINISHES, WATER_SOURCES, POWER_BACKUP,
} from '../data/specs.js';

const STEPS = ['Basics', 'Location', 'Building', 'Finishes', 'Amenities', 'Photos', 'Review'];

const empty = {
  name: '', property_type: 'apartment_block', description: '',
  address: '', city: '', region: '', country: '', digital_address: '',
  storeys: '', floors: '', staircases: '', staircase_type: '',
  year_built: '', total_units: '', parking_spaces: '',
  plot_size: '', plot_size_unit: 'sqm',
  glass_panel_type: '', exterior_finish: '', roofing_type: '', wall_material: '',
  water_source: '', power_backup: '',
  amenities: [], photo_urls: [], photo_url: '',
};

// Guided property intake. The record is created at step one so a
// part-finished entry is saved and resumable, matching tenant onboarding.
export default function PropertyOnboarding() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  const [propertyId, setPropertyId] = useState(routeId || null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!routeId) return;
    getProperty(routeId)
      .then((p) => setForm({ ...empty, ...p, amenities: p.amenities || [], photo_urls: p.photo_urls || [] }))
      .catch((err) => setError(readApiError(err, 'load this property')));
  }, [routeId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));

  // Saves progress and moves on. Creating on the first advance means
  // nothing typed so far is lost if they wander off.
  const saveAndGo = async (nextStep) => {
    setError('');
    setSaving(true);
    try {
      if (!propertyId) {
        const created = await createProperty(form);
        setPropertyId(created.id);
      } else {
        await updateProperty(propertyId, form);
      }
      setStep(nextStep);
    } catch (err) {
      setError(readApiError(err, 'save this property'));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setError('');
    setSaving(true);
    try {
      if (propertyId) await updateProperty(propertyId, form);
      navigate(`/properties/${propertyId}`);
    } catch (err) {
      setError(readApiError(err, 'save this property'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <StepChips steps={STEPS} step={step} setStep={setStep} unlocked={Boolean(propertyId)} />

      {propertyId && (
        <p className="text-xs text-stone mb-4">
          Saved — you can leave and come back to finish this.
        </p>
      )}
      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {step === 0 && (
        <WizardStep
          title="What are you adding?"
          hint="Only the name is required — everything else can follow."
          onNext={() => saveAndGo(1)}
          busy={saving}
          canNext={Boolean(form.name.trim())}
          nextLabel={propertyId ? 'Save & continue' : 'Create & continue'}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required placeholder="Property name (e.g. Airport Residency)" className="lx-input sm:col-span-2"
              value={form.name} onChange={(e) => set({ name: e.target.value })}
            />
            <div>
              <label className="block text-xs text-stone mb-1">Type</label>
              <select className="lx-select" value={form.property_type}
                onChange={(e) => set({ property_type: e.target.value })}>
                {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <NumField label="Total units in this property" value={form.total_units}
              onChange={(v) => set({ total_units: v })} />
          </div>
          <textarea
            className="lx-input" rows={3}
            placeholder="Description — this appears on your public showcase link"
            value={form.description} onChange={(e) => set({ description: e.target.value })}
          />
        </WizardStep>
      )}

      {step === 1 && (
        <WizardStep title="Where is it?" hint="Shown on the listing, minus the exact street address."
          onBack={() => setStep(0)} onNext={() => saveAndGo(2)} busy={saving}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className="lx-input sm:col-span-2" placeholder="Street address"
              value={form.address} onChange={(e) => set({ address: e.target.value })} />
            <input className="lx-input" placeholder="Digital address / GPS"
              value={form.digital_address} onChange={(e) => set({ digital_address: e.target.value })} />
            <input className="lx-input" placeholder="City"
              value={form.city} onChange={(e) => set({ city: e.target.value })} />
            <input className="lx-input" placeholder="Region"
              value={form.region} onChange={(e) => set({ region: e.target.value })} />
            <input className="lx-input" placeholder="Country"
              value={form.country} onChange={(e) => set({ country: e.target.value })} />
            <div className="grid grid-cols-2 gap-2 sm:col-span-2">
              <NumField label="Plot size" value={form.plot_size} onChange={(v) => set({ plot_size: v })} />
              <div>
                <label className="block text-xs text-stone mb-1">Unit</label>
                <select className="lx-select" value={form.plot_size_unit}
                  onChange={(e) => set({ plot_size_unit: e.target.value })}>
                  <option value="sqm">sqm</option>
                  <option value="sqft">sqft</option>
                  <option value="acres">acres</option>
                  <option value="plots">plots</option>
                </select>
              </div>
            </div>
          </div>
        </WizardStep>
      )}

      {step === 2 && (
        <WizardStep title="The building" hint="Structure and layout of the property as a whole."
          onBack={() => setStep(1)} onNext={() => saveAndGo(3)} busy={saving}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Storeys" value={form.storeys} onChange={(v) => set({ storeys: v })} placeholder="e.g. 3" />
            <NumField label="Floors" value={form.floors} onChange={(v) => set({ floors: v })} />
            <NumField label="Year built" value={form.year_built} onChange={(v) => set({ year_built: v })} />
            <NumField label="Staircases" value={form.staircases} onChange={(v) => set({ staircases: v })} />
            <NumField label="Parking spaces" value={form.parking_spaces} onChange={(v) => set({ parking_spaces: v })} />
          </div>
          <ComboField label="Staircase type" value={form.staircase_type}
            onChange={(v) => set({ staircase_type: v })} options={STAIRCASE_TYPES} />
        </WizardStep>
      )}

      {step === 3 && (
        <WizardStep title="Materials & finishes" hint="The details that make a listing feel real."
          onBack={() => setStep(2)} onNext={() => saveAndGo(4)} busy={saving}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComboField label="Glass panels" value={form.glass_panel_type}
              onChange={(v) => set({ glass_panel_type: v })} options={GLASS_PANEL_TYPES} />
            <ComboField label="Exterior finish" value={form.exterior_finish}
              onChange={(v) => set({ exterior_finish: v })} options={EXTERIOR_FINISHES} />
            <ComboField label="Roofing" value={form.roofing_type}
              onChange={(v) => set({ roofing_type: v })} options={ROOFING_TYPES} />
            <ComboField label="Wall material" value={form.wall_material}
              onChange={(v) => set({ wall_material: v })} options={WALL_MATERIALS} />
            <ComboField label="Water source" value={form.water_source}
              onChange={(v) => set({ water_source: v })} options={WATER_SOURCES} />
            <ComboField label="Power backup" value={form.power_backup}
              onChange={(v) => set({ power_backup: v })} options={POWER_BACKUP} />
          </div>
        </WizardStep>
      )}

      {step === 4 && (
        <WizardStep title="Amenities" hint="Tap everything this property offers."
          onBack={() => setStep(3)} onNext={() => saveAndGo(5)} busy={saving}>
          <ChipGroup options={AMENITIES} selected={form.amenities} onToggle={(a) => toggle('amenities', a)} />
        </WizardStep>
      )}

      {step === 5 && (
        <WizardStep title="Photos" hint="These become the slideshow on your shared link."
          onBack={() => setStep(4)} onNext={() => saveAndGo(6)} busy={saving}>
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
                  <button
                    type="button"
                    onClick={() => set({ photo_urls: form.photo_urls.filter((u) => u !== url) })}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {form.photo_urls.length === 0 && (
            <p className="text-xs text-stone">No photos yet — a listing with photos gets far more interest.</p>
          )}
        </WizardStep>
      )}

      {step === 6 && (
        <WizardStep title="Review" hint="Anything blank can be filled in later from the property page."
          onBack={() => setStep(5)} onNext={finish} busy={saving} nextLabel="Finish">
          <Row label="Name" value={form.name} />
          <Row label="Type" value={PROPERTY_TYPES.find((t) => t.value === form.property_type)?.label} />
          <Row label="Location" value={[form.city, form.region, form.country].filter(Boolean).join(', ')} />
          <Row label="Storeys" value={form.storeys} />
          <Row label="Staircases" value={[form.staircases, form.staircase_type].filter(Boolean).join(' · ')} />
          <Row label="Glass panels" value={form.glass_panel_type} />
          <Row label="Finishes" value={[form.exterior_finish, form.roofing_type, form.wall_material].filter(Boolean).join(' · ')} />
          <Row label="Amenities" value={form.amenities.join(', ')} />
          <Row label="Photos" value={`${form.photo_urls.length} uploaded`} />
          <p className="text-xs text-stone pt-1">
            Next: add the apartments inside this property from the Units page.
          </p>
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
