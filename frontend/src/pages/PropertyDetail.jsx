import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProperty, updateProperty, deleteProperty, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Slideshow from '../components/Slideshow.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import { PROPERTY_TYPES, AMENITIES } from './Properties.jsx';
import { CurrencyField } from '../components/Money.jsx';

export default function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const { money, currency } = useSettings();
  const [property, setProperty] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    getProperty(id)
      .then((p) => {
        setProperty(p);
        setForm(p);
      })
      .catch((err) => setError(readApiError(err, 'load this property')));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      const updated = await updateProperty(id, form);
      setProperty({ ...updated, units: property.units });
      setForm({ ...updated, units: property.units });
      setEditing(false);
    } catch (err) {
      setError(readApiError(err, 'save this property'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError('');
    try {
      await deleteProperty(id);
      navigate('/properties');
    } catch (err) {
      setError(readApiError(err, 'delete this property'));
    }
  };

  if (!property) {
    return <div className="text-stone text-sm">{error || 'Loading…'}</div>;
  }

  const photos = property.photo_urls?.length ? property.photo_urls : property.photo_url ? [property.photo_url] : [];

  return (
    <div>
      <Link to="/properties" className="text-sm text-stone hover:text-ink mb-4 inline-block">
        ← All properties
      </Link>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="rounded-2xl overflow-hidden mb-5">
        <Slideshow photos={photos} alt={property.name} heightClass="h-48 sm:h-64" />
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h2 className="font-serif text-2xl text-ink">{property.name}</h2>
          <p className="text-stone text-sm capitalize">
            {property.property_type?.replace(/_/g, ' ')}
            {property.city ? ` · ${property.city}` : ''}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setEditing((s) => !s)} className="lx-btn-ghost text-xs px-3 py-1.5">
              {editing ? 'Cancel' : 'Edit details'}
            </button>
            {property.units.length === 0 && (
              <button onClick={remove} className="lx-btn-ghost text-xs px-3 py-1.5 text-rose-700">
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {[property.address, property.digital_address, property.region, property.country]
        .filter(Boolean).length > 0 && (
        <p className="text-xs text-stone mb-4">
          {[property.address, property.digital_address, property.region, property.country].filter(Boolean).join(' · ')}
        </p>
      )}

      {property.description && !editing && <p className="text-sm text-stone mb-5">{property.description}</p>}

      {property.amenities?.length > 0 && !editing && (
        <div className="flex flex-wrap gap-2 mb-6">
          {property.amenities.map((a) => (
            <span key={a} className="pill bg-stone/10 text-stone">{a}</span>
          ))}
        </div>
      )}

      {canEdit && editing && form && (
        <div className="lx-card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              className="lx-input sm:col-span-2" placeholder="Property name"
              value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="lx-select" value={form.property_type || 'apartment_block'}
              onChange={(e) => setForm({ ...form, property_type: e.target.value })}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <CurrencyField
              label="Rent currency"
              value={form.currency}
              onChange={(value) => setForm({ ...form, currency: value })}
              inheritedFrom="company default"
              inheritedValue={currency}
            />
            <input
              className="lx-input sm:col-span-2" placeholder="Street address"
              value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <input
              className="lx-input" placeholder="Digital address (GPS)"
              value={form.digital_address || ''} onChange={(e) => setForm({ ...form, digital_address: e.target.value })}
            />
            <input
              className="lx-input" placeholder="City"
              value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <input
              className="lx-input" placeholder="Region"
              value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
            <input
              className="lx-input" placeholder="Country"
              value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <input
              type="number" className="lx-input" placeholder="Year built"
              value={form.year_built ?? ''} onChange={(e) => setForm({ ...form, year_built: e.target.value })}
            />
            <input
              type="number" className="lx-input" placeholder="Floors"
              value={form.floors ?? ''} onChange={(e) => setForm({ ...form, floors: e.target.value })}
            />
          </div>

          <textarea
            className="lx-input" rows={2} placeholder="Description"
            value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div>
            <div className="lx-eyebrow mb-2">Amenities</div>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => {
                const on = (form.amenities || []).includes(a);
                return (
                  <button
                    key={a} type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        amenities: on
                          ? (form.amenities || []).filter((x) => x !== a)
                          : [...(form.amenities || []), a],
                      })
                    }
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      on ? 'border-gold bg-gold/10 text-ink font-medium' : 'border-line text-stone hover:border-stone/40'
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <span className="lx-eyebrow">Photos ({(form.photo_urls || []).length})</span>
              <PhotoUploader
                onUploaded={(urls) =>
                  setForm((f) => ({
                    ...f,
                    photo_urls: [...(f.photo_urls || []), ...urls],
                    photo_url: f.photo_url || urls[0],
                  }))
                }
              />
            </div>
            {(form.photo_urls || []).length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {form.photo_urls.map((url) => (
                  <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-line">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, photo_urls: f.photo_urls.filter((u) => u !== url) }))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={save} disabled={saving} className="lx-btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-lg text-ink">Units in this property ({property.units.length})</h3>
        <Link to="/units" className="text-xs text-gold hover:underline">Add a unit →</Link>
      </div>

      <div className="lx-card divide-y divide-line/70">
        {property.units.map((u) => (
          <Link key={u.id} to={`/units/${u.id}`} className="p-4 flex items-center gap-3 hover:bg-panel/50 transition">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-ink">{u.unit_code}</div>
              <div className="text-xs text-stone">
                {u.unit_type} · {u.bedrooms ?? '–'} bd / {u.bathrooms ?? '–'} ba
                {u.base_rate_long ? ` · ${money(u.base_rate_long)}/mo` : ''}
              </div>
            </div>
            <StatusBadge status={u.status} />
          </Link>
        ))}
        {property.units.length === 0 && (
          <div className="p-6 text-sm text-stone">
            No units yet. Add apartments or houses from the Units page and choose this property.
          </div>
        )}
      </div>
    </div>
  );
}
