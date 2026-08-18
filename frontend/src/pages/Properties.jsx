import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProperties, createProperty, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
import { PROPERTY_TYPES as TYPES, AMENITIES as AMENITY_LIST } from '../data/specs.js';

// Single source of truth lives in data/specs.js — re-exported here so the
// existing imports in PropertyDetail keep working.
export { PROPERTY_TYPES, AMENITIES } from '../data/specs.js';

const emptyForm = {
  name: '', property_type: 'apartment_block', address: '', city: '', region: '',
  country: '', digital_address: '', year_built: '', floors: '', description: '',
  photo_url: '', photo_urls: [], amenities: [],
};

export default function Properties() {
  const { canEdit } = useAuth();
  const [properties, setProperties] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { query, setQuery, results: shownProperties } = useSearch(
    properties,
    ['name', 'city', 'region', 'country', 'property_type']
  );

  const load = () =>
    getProperties()
      .then(setProperties)
      .catch((err) => setError(readApiError(err, 'load properties')));

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createProperty(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(readApiError(err, 'create property'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAmenity = (a) =>
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a) ? f.amenities.filter((x) => x !== a) : [...f.amenities, a],
    }));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">
          Your buildings and estates. Each apartment or house lives inside one of these.
        </p>
        {canEdit && (
          <div className="flex gap-3 w-full sm:w-auto">
            <Link to="/properties/onboard" className="lx-btn-primary flex-1 sm:flex-none text-center">
              + Add Property
            </Link>
            <button onClick={() => setShowForm((s) => !s)} className="lx-btn-ghost flex-1 sm:flex-none">
              {showForm ? 'Cancel' : 'Quick add'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {canEdit && showForm && (
        <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <input
              required placeholder="Property name (e.g. Airport Residency)" className="lx-input sm:col-span-2"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="lx-select" value={form.property_type}
              onChange={(e) => setForm({ ...form, property_type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              placeholder="Street address" className="lx-input sm:col-span-2"
              value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <input
              placeholder="Digital address (GPS)" className="lx-input"
              value={form.digital_address} onChange={(e) => setForm({ ...form, digital_address: e.target.value })}
            />
            <input
              placeholder="City" className="lx-input"
              value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <input
              placeholder="Region" className="lx-input"
              value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
            <input
              placeholder="Country" className="lx-input"
              value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <input
              type="number" placeholder="Year built" className="lx-input"
              value={form.year_built} onChange={(e) => setForm({ ...form, year_built: e.target.value })}
            />
            <input
              type="number" placeholder="Number of floors" className="lx-input"
              value={form.floors} onChange={(e) => setForm({ ...form, floors: e.target.value })}
            />
          </div>

          <textarea
            placeholder="Description (shown on the public showcase)" rows={2} className="lx-input"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div>
            <div className="lx-eyebrow mb-2">Amenities</div>
            <div className="flex flex-wrap gap-2">
              {AMENITY_LIST.map((a) => (
                <button
                  key={a} type="button" onClick={() => toggleAmenity(a)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${
                    form.amenities.includes(a)
                      ? 'border-gold bg-gold/10 text-ink font-medium'
                      : 'border-line text-stone hover:border-stone/40'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <span className="lx-eyebrow">Photos ({form.photo_urls.length})</span>
              <PhotoUploader
                onUploaded={(urls) =>
                  setForm((f) => ({
                    ...f,
                    photo_urls: [...f.photo_urls, ...urls],
                    photo_url: f.photo_url || urls[0],
                  }))
                }
              />
            </div>
            {form.photo_urls.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {form.photo_urls.map((url) => (
                  <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-line">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, photo_urls: f.photo_urls.filter((u) => u !== url) }))
                      }
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button disabled={saving} className="lx-btn-gold w-full sm:w-auto">
            {saving ? 'Saving…' : 'Create Property'}
          </button>
        </form>
      )}

      {properties.length > 0 && (
        <SearchBar
          value={query} onChange={setQuery} placeholder="Search properties, city…"
          count={shownProperties.length} total={properties.length}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shownProperties.map((p) => (
          <Link key={p.id} to={`/properties/${p.id}`} className="lx-card overflow-hidden hover:shadow-lift transition block">
            {p.photo_url ? (
              <div className="h-36 w-full overflow-hidden">
                <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ) : (
              <div className="h-36 w-full bg-gradient-to-br from-ink to-ink-soft" />
            )}
            <div className="p-5">
              <div className="font-serif text-lg text-ink">{p.name}</div>
              <div className="text-sm text-stone capitalize">
                {p.property_type?.replace(/_/g, ' ')}
                {p.city ? ` · ${p.city}` : ''}
              </div>
              <div className="flex gap-4 text-xs text-stone mt-3 pt-3 border-t border-line/70">
                <span><span className="text-ink font-medium">{p.unit_count}</span> units</span>
                <span><span className="text-ink font-medium">{p.occupied_count}</span> occupied</span>
                <span><span className="text-ink font-medium">{p.vacant_count}</span> vacant</span>
              </div>
            </div>
          </Link>
        ))}
        {properties.length === 0 && (
          <div className="text-stone col-span-full text-sm">
            No properties yet. Add one, then create the apartments or houses inside it.
          </div>
        )}
      </div>
    </div>
  );
}
