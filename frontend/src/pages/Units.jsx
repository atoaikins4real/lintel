import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnits, createUnit, getProperties, readApiError } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
import { STOCK_PHOTOS, suggestedPhotos } from '../data/stockPhotos.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const emptyForm = {
  unit_code: '', property_id: '', unit_type: 'apartment', class: 'standard',
  bedrooms: '', bathrooms: '', city: '', base_rate_short: '', base_rate_long: '', photo_url: '',
  photo_urls: [],
};

const CLASS_STYLE = {
  standard: 'bg-stone/10 text-stone',
  premium: 'bg-sky-50 text-sky-700',
  luxury: 'bg-gold/10 text-gold',
};

export default function Units() {
  const { canEdit, company } = useAuth();
  const { money } = useSettings();
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [error, setError] = useState('');

  const [properties, setProperties] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [listingFilter, setListingFilter] = useState('');
  const { query, setQuery, results: shownUnits } = useSearch(
    units,
    ['unit_code', 'property_name', 'city', 'unit_type', 'class'],
    (u) =>
      (!statusFilter || u.status === statusFilter) &&
      (!listingFilter || u.listing_type === listingFilter || u.listing_type === 'both')
  );

  const load = () =>
    getUnits()
      .then(setUnits)
      .catch((err) => setError(readApiError(err, 'load units')));

  useEffect(() => {
    load();
    getProperties().then(setProperties).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createUnit(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      // Previously this had no catch at all, so a failed create looked
      // like nothing happened — no error, no feedback.
      setError(readApiError(err, 'create unit'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Apartments and housing, short-stay through multi-year.</p>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {company?.slug && (
            <a
              href={`/showcase/${company.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="lx-btn-ghost text-sm flex-1 sm:flex-none text-center"
            >
              View public showcase ↗
            </a>
          )}
          {canEdit && (
            <>
              <Link to="/units/onboard" className="lx-btn-primary flex-1 sm:flex-none text-center">
                + Add Apartment
              </Link>
              <button onClick={() => setShowForm((s) => !s)} className="lx-btn-ghost flex-1 sm:flex-none">
                {showForm ? 'Cancel' : 'Quick add'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {canEdit && showForm && properties.length === 0 && (
        <div className="mb-5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          You don&apos;t have any properties yet, and every unit belongs to one.{' '}
          <Link to="/properties" className="underline font-medium">Add a property first</Link>.
        </div>
      )}

      {canEdit && showForm && properties.length > 0 && (
        <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <input required placeholder="Unit code (e.g. Airport Res - 4B)" className="lx-input sm:col-span-2"
            value={form.unit_code} onChange={(e) => setForm({ ...form, unit_code: e.target.value })} />
          <select className="lx-select" value={form.class}
            onChange={(e) => setForm({ ...form, class: e.target.value })}>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
            <option value="luxury">Luxury</option>
          </select>
          <select required className="lx-select" value={form.property_id}
            onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
            <option value="">Select property…</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select className="lx-select" value={form.unit_type}
            onChange={(e) => setForm({ ...form, unit_type: e.target.value })}>
            <option value="apartment">Apartment</option>
            <option value="house">House</option>
            <option value="townhouse">Townhouse</option>
            <option value="studio">Studio</option>
          </select>
          <input placeholder="City" className="lx-input"
            value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input type="number" placeholder="Bedrooms" className="lx-input"
            value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} />
          <input type="number" placeholder="Bathrooms" className="lx-input"
            value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} />
          <input type="number" placeholder="Nightly rate (short-stay)" className="lx-input"
            value={form.base_rate_short} onChange={(e) => setForm({ ...form, base_rate_short: e.target.value })} />
          <input type="number" placeholder="Monthly rate (long-stay)" className="lx-input"
            value={form.base_rate_long} onChange={(e) => setForm({ ...form, base_rate_long: e.target.value })} />
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="flex items-center justify-between mb-2">
              <span className="lx-eyebrow">Property photo (optional — shown on the dashboard hero)</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setShowAllPhotos((s) => !s)} className="text-xs text-gold hover:underline">
                  {showAllPhotos ? 'Show suggested only' : 'Show all photos'}
                </button>
                <button type="button" onClick={() => setShowUrlInput((s) => !s)} className="text-xs text-stone hover:underline">
                  {showUrlInput ? 'Cancel custom URL' : 'Paste a URL instead'}
                </button>
              </div>
            </div>

            {showUrlInput ? (
              <input placeholder="https://…" className="lx-input"
                value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {(showAllPhotos ? STOCK_PHOTOS : suggestedPhotos(form.unit_type, form.class)).map((p) => {
                  const selected = form.photo_url === p.full;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      title={`${p.label} — photo by ${p.credit} on Unsplash`}
                      onClick={() => setForm({ ...form, photo_url: p.full })}
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
            )}
            {form.photo_url && !showUrlInput && (
              <button type="button" onClick={() => setForm({ ...form, photo_url: '' })} className="text-xs text-stone hover:underline mt-2">
                Clear photo
              </button>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <span className="lx-eyebrow">
                Showcase gallery ({form.photo_urls.length} selected — shown as a slideshow on the public share link)
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <PhotoUploader
                  onUploaded={(urls) => setForm((f) => ({ ...f, photo_urls: [...f.photo_urls, ...urls] }))}
                />
                <button type="button" onClick={() => setShowAllPhotos((s) => !s)} className="text-xs text-gold hover:underline">
                  {showAllPhotos ? 'Show suggested only' : 'Show all photos'}
                </button>
              </div>
            </div>

            {/* Photos uploaded from the device, shown ahead of the stock library */}
            {form.photo_urls.filter((u) => !STOCK_PHOTOS.some((p) => p.full === u)).length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-2">
                {form.photo_urls
                  .filter((u) => !STOCK_PHOTOS.some((p) => p.full === u))
                  .map((url) => (
                    <div key={url} className="relative aspect-square rounded-lg overflow-hidden border-2 border-gold ring-2 ring-gold/30">
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => setForm((f) => ({ ...f, photo_urls: f.photo_urls.filter((u) => u !== url) }))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/70 text-white text-xs flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {(showAllPhotos ? STOCK_PHOTOS : suggestedPhotos(form.unit_type, form.class)).map((p) => {
                const selected = form.photo_urls.includes(p.full);
                return (
                  <button
                    type="button"
                    key={p.id}
                    title={`${p.label} — photo by ${p.credit} on Unsplash`}
                    onClick={() =>
                      setForm({
                        ...form,
                        photo_urls: selected
                          ? form.photo_urls.filter((url) => url !== p.full)
                          : [...form.photo_urls, p.full],
                      })
                    }
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

          <button disabled={saving} className="lx-btn-gold sm:col-span-2 lg:col-span-3 justify-self-start w-full sm:w-auto">
            {saving ? 'Saving…' : 'Create Unit'}
          </button>
        </form>
      )}

      <SearchBar
        value={query} onChange={setQuery} placeholder="Search units, property, city…"
        count={shownUnits.length} total={units.length}
      >
        <select className="lx-select !py-2 text-sm w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any status</option>
          <option value="vacant">Vacant</option>
          <option value="occupied">Occupied</option>
          <option value="maintenance">Maintenance</option>
          <option value="off_market">Off market</option>
        </select>
        <select className="lx-select !py-2 text-sm w-auto" value={listingFilter} onChange={(e) => setListingFilter(e.target.value)}>
          <option value="">Rent or sale</option>
          <option value="rent">To rent</option>
          <option value="sale">For sale</option>
        </select>
      </SearchBar>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shownUnits.map((u) => (
          <Link key={u.id} to={`/units/${u.id}`} className="lx-card overflow-hidden hover:shadow-lift transition block">
            {u.photo_url ? (
              <div className="h-36 w-full overflow-hidden">
                <img src={u.photo_url} alt={u.unit_code} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ) : (
              <div className="h-36 w-full bg-gradient-to-br from-ink to-ink-soft" />
            )}
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className={`pill uppercase ${CLASS_STYLE[u.class] || CLASS_STYLE.standard}`}>{u.class}</span>
                <StatusBadge status={u.status} />
              </div>
              <div className="font-serif text-lg text-ink">{u.unit_code}</div>
              <div className="text-sm text-stone">{u.property_name}{u.city ? ` · ${u.city}` : ''}</div>
              <div className="text-xs text-stone mt-3 pt-3 border-t border-line/70">
                {u.base_rate_short ? `${money(u.base_rate_short)}/night` : ''}
                {u.base_rate_short && u.base_rate_long ? ' · ' : ''}
                {u.base_rate_long ? `${money(u.base_rate_long)}/mo` : ''}
              </div>
            </div>
          </Link>
        ))}
        {units.length > 0 && shownUnits.length === 0 && (
          <div className="text-stone col-span-full text-sm">Nothing matches that search.</div>
        )}
        {units.length === 0 && <div className="text-stone col-span-full">No units yet.</div>}
      </div>
    </div>
  );
}
