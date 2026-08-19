import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getUnit, getUnitPerformance, getExpenses, getRenovations, getFaults,
  updateUnit, deleteUnit, getProperties, readApiError,
} from '../api/client.js';
import { CurrencyField } from '../components/Money.jsx';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import { STOCK_PHOTOS, suggestedPhotos } from '../data/stockPhotos.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function UnitDetail() {
  const { id } = useParams();
  const { canEdit, company, isManager } = useAuth();
  const { money, currency } = useSettings();
  const [unit, setUnit] = useState(null);
  const [perf, setPerf] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [renovations, setRenovations] = useState([]);
  const [faults, setFaults] = useState([]);
  const [copied, setCopied] = useState(false);
  const [editingGallery, setEditingGallery] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [savingGallery, setSavingGallery] = useState(false);

  // Editing the unit itself. Until now this page could only change the
  // photo gallery — the rent, status and specification were fixed once
  // the unit was created, and there was no way to delete one at all.
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [properties, setProperties] = useState([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getUnit(id).then(setUnit);
    getUnitPerformance(id).then(setPerf);
    getExpenses({ unit_id: id }).then(setExpenses);
    getRenovations({ unit_id: id }).then(setRenovations);
    getFaults({ unit_id: id }).then(setFaults);
    getProperties().then(setProperties).catch(() => setProperties([]));
  }, [id]);

  const startEditing = () => {
    setError('');
    setForm({
      unit_code: unit.unit_code || '',
      property_id: unit.property_id || '',
      unit_type: unit.unit_type || 'apartment',
      class: unit.class || 'standard',
      status: unit.status || 'vacant',
      bedrooms: unit.bedrooms ?? '',
      bathrooms: unit.bathrooms ?? '',
      floor_area: unit.floor_area ?? '',
      city: unit.city || '',
      base_rate_short: unit.base_rate_short ?? '',
      base_rate_long: unit.base_rate_long ?? '',
      // null means "inherit from the property", which is a real choice
      // here rather than a missing value.
      currency: unit.currency || null,
      notes: unit.notes || '',
    });
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const updated = await updateUnit(id, form);
      setUnit(updated);
      setForm(null);
    } catch (err) {
      setError(readApiError(err, 'save this apartment'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError('');
    setRemoving(true);
    try {
      await deleteUnit(id);
      navigate('/units', { replace: true });
    } catch (err) {
      // The backend refuses to delete a unit with leases or payments
      // attached, so this is where the operator learns why.
      setError(readApiError(err, 'delete this apartment'));
      setConfirmDelete(false);
    } finally {
      setRemoving(false);
    }
  };

  const parentProperty = properties.find((p) => p.id === (form?.property_id || unit?.property_id));

  const shareUrl = company?.slug ? `${window.location.origin}/showcase/${company.slug}/${id}` : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  const savePhotoUrls = async (next) => {
    setSavingGallery(true);
    try {
      const updated = await updateUnit(id, { photo_urls: next });
      setUnit(updated);
    } finally {
      setSavingGallery(false);
    }
  };

  const togglePhoto = (url) => {
    const current = unit.photo_urls || [];
    return savePhotoUrls(current.includes(url) ? current.filter((u) => u !== url) : [...current, url]);
  };

  const addUploadedPhotos = (urls) => savePhotoUrls([...(unit.photo_urls || []), ...urls]);

  if (!unit) return <div className="text-stone">Loading&hellip;</div>;

  return (
    <div>
      {unit.photo_url ? (
        <div className="h-48 sm:h-64 w-full rounded-2xl overflow-hidden mb-5">
          <img src={unit.photo_url} alt={unit.unit_code} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="h-48 sm:h-64 w-full rounded-2xl bg-gradient-to-br from-ink to-ink-soft mb-5" />
      )}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <span className="lx-eyebrow">{unit.class}</span>
        <StatusBadge status={unit.status} />
      </div>
      <p className="text-stone text-sm mb-3">{unit.property_name}{unit.city ? ` · ${unit.city}` : ''}</p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button onClick={copyLink} className="lx-btn-ghost text-xs px-3 py-1.5">
          {copied ? 'Link copied ✓' : 'Copy public share link'}
        </button>
        {canEdit && (
          <button onClick={() => setEditingGallery((s) => !s)} className="lx-btn-ghost text-xs px-3 py-1.5">
            {editingGallery ? 'Done' : `Manage showcase gallery (${(unit.photo_urls || []).length})`}
          </button>
        )}
        {canEdit && (
          <button onClick={() => (form ? setForm(null) : startEditing())} className="lx-btn-ghost text-xs px-3 py-1.5">
            {form ? 'Cancel edit' : 'Edit apartment'}
          </button>
        )}
        {isManager && !form && (
          confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-rose-700">Delete this apartment?</span>
              <button
                onClick={remove}
                disabled={removing}
                className="text-xs px-2.5 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {removing ? 'Removing…' : 'Yes, delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-stone hover:text-ink">
                Cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-rose-700 hover:text-rose-800 px-2 py-1.5">
              Delete
            </button>
          )
        )}
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-3">
          {error}
        </div>
      )}

      {canEdit && form && (
        <form onSubmit={save} className="lx-card p-5 mb-6">
          <div className="lx-eyebrow mb-3">Edit apartment</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="lx-label">Unit code</span>
              <input required className="lx-input" value={form.unit_code}
                onChange={(e) => set({ unit_code: e.target.value })} />
            </label>
            <label className="block">
              <span className="lx-label">Property</span>
              <select className="lx-input" value={form.property_id}
                onChange={(e) => set({ property_id: e.target.value })}>
                <option value="">— none —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="lx-label">Status</span>
              <select className="lx-input" value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {['vacant', 'occupied', 'maintenance', 'off_market'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="lx-label">Class</span>
              <select className="lx-input" value={form.class} onChange={(e) => set({ class: e.target.value })}>
                {['standard', 'premium', 'luxury'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="lx-label">Bedrooms</span>
              <input type="number" min="0" className="lx-input" value={form.bedrooms}
                onChange={(e) => set({ bedrooms: e.target.value })} />
            </label>
            <label className="block">
              <span className="lx-label">Bathrooms</span>
              <input type="number" min="0" className="lx-input" value={form.bathrooms}
                onChange={(e) => set({ bathrooms: e.target.value })} />
            </label>
            <label className="block">
              <span className="lx-label">Nightly rate</span>
              <input type="number" min="0" className="lx-input" value={form.base_rate_short}
                onChange={(e) => set({ base_rate_short: e.target.value })} />
            </label>
            <label className="block">
              <span className="lx-label">Monthly rate</span>
              <input type="number" min="0" className="lx-input" value={form.base_rate_long}
                onChange={(e) => set({ base_rate_long: e.target.value })} />
            </label>

            <CurrencyField
              label="Rent currency"
              value={form.currency}
              onChange={(currency) => set({ currency })}
              inheritedFrom={parentProperty ? `property (${parentProperty.name})` : 'company default'}
              inheritedValue={parentProperty?.currency || currency}
            />

            <label className="block">
              <span className="lx-label">City</span>
              <input className="lx-input" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </label>
            <label className="block sm:col-span-2">
              <span className="lx-label">Internal notes</span>
              <textarea rows={2} className="lx-input" value={form.notes}
                onChange={(e) => set({ notes: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving} className="lx-btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="lx-btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {canEdit && editingGallery && (
        <div className="lx-card p-5 mb-6">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <span className="lx-eyebrow">
              Tap photos to add/remove them from the public slideshow
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <PhotoUploader onUploaded={addUploadedPhotos} />
              <button type="button" onClick={() => setShowAllPhotos((s) => !s)} className="text-xs text-gold hover:underline">
                {showAllPhotos ? 'Show suggested only' : 'Show all photos'}
              </button>
            </div>
          </div>

          {/* Device uploads for this unit, shown ahead of the stock library */}
          {(unit.photo_urls || []).filter((u) => !STOCK_PHOTOS.some((p) => p.full === u)).length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-2">
              {(unit.photo_urls || [])
                .filter((u) => !STOCK_PHOTOS.some((p) => p.full === u))
                .map((url) => (
                  <div key={url} className="relative aspect-square rounded-lg overflow-hidden border-2 border-gold ring-2 ring-gold/30">
                    <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      title="Remove"
                      disabled={savingGallery}
                      onClick={() => togglePhoto(url)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {(showAllPhotos ? STOCK_PHOTOS : suggestedPhotos(unit.unit_type, unit.class)).map((p) => {
              const selected = (unit.photo_urls || []).includes(p.full);
              return (
                <button
                  type="button"
                  key={p.id}
                  disabled={savingGallery}
                  title={`${p.label} — photo by ${p.credit} on Unsplash`}
                  onClick={() => togglePhoto(p.full)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                    selected ? 'border-gold ring-2 ring-gold/30' : 'border-transparent hover:border-line'
                  }`}
                >
                  <img src={p.thumb} alt={p.label} className="w-full h-full object-cover" loading="lazy" />
                  {selected && (
                    <span className="absolute inset-0 bg-ink/20 flex items-center justify-center">
                      <span className="w-5 h-5 rounded-full bg-gold text-white text-xs flex items-center justify-center">✓</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {perf && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <StatCard label="Revenue" value={money(perf.revenue)} />
          <StatCard label="Costs" value={money(perf.total_costs)} />
          <StatCard label="Net Yield" value={money(perf.net_yield)} />
          <StatCard label="Occupancy" value={`${perf.occupancy_rate}%`} />
          <StatCard label="Open Faults" value={perf.open_faults} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <ListSection title="Expenses" items={expenses} render={(e) => `${e.expense_date} · ${e.category} · ${money(e.amount)}`} />
        <ListSection
          title="Renovations"
          items={renovations}
          render={(r) => `${r.description} · ${money(r.cost)}${r.rate_before && r.rate_after ? ` · ${money(r.rate_before)} → ${money(r.rate_after)}` : ''}`}
        />
        <ListSection title="Faults" items={faults} render={(f) => `${f.reported_date} · ${f.description} · ${f.severity} · ${f.status}`} />
      </div>
    </div>
  );
}

function ListSection({ title, items, render }) {
  return (
    <div className="lx-card p-5 sm:p-6">
      <div className="font-serif text-lg text-ink mb-4">{title}</div>
      {items.length ? (
        <ul className="space-y-2.5 text-sm">
          {items.map((item) => (
            <li key={item.id} className="border-b border-line/70 pb-2.5 last:border-0">{render(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone">None recorded.</p>
      )}
    </div>
  );
}
