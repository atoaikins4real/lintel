import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnits, createUnit } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { STOCK_PHOTOS, suggestedPhotos } from '../data/stockPhotos.js';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = {
  unit_code: '', property_name: '', unit_type: 'apartment', class: 'standard',
  bedrooms: '', bathrooms: '', city: '', base_rate_short: '', base_rate_long: '', photo_url: '',
};

const CLASS_STYLE = {
  standard: 'bg-stone/10 text-stone',
  premium: 'bg-sky-50 text-sky-700',
  luxury: 'bg-gold/10 text-gold',
};

export default function Units() {
  const { canEdit } = useAuth();
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const load = () => getUnits().then(setUnits);

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createUnit(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Apartments and housing, short-stay through multi-year.</p>
        {canEdit && (
          <button onClick={() => setShowForm((s) => !s)} className="lx-btn-primary w-full sm:w-auto">
            {showForm ? 'Cancel' : '+ New Unit'}
          </button>
        )}
      </div>

      {canEdit && showForm && (
        <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <input required placeholder="Unit code (e.g. Airport Res - 4B)" className="lx-input sm:col-span-2"
            value={form.unit_code} onChange={(e) => setForm({ ...form, unit_code: e.target.value })} />
          <select className="lx-select" value={form.class}
            onChange={(e) => setForm({ ...form, class: e.target.value })}>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
            <option value="luxury">Luxury</option>
          </select>
          <input required placeholder="Property name" className="lx-input"
            value={form.property_name} onChange={(e) => setForm({ ...form, property_name: e.target.value })} />
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
          <button disabled={saving} className="lx-btn-gold sm:col-span-2 lg:col-span-3 justify-self-start w-full sm:w-auto">
            {saving ? 'Saving…' : 'Create Unit'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {units.map((u) => (
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
                {u.base_rate_short ? `GHS ${u.base_rate_short}/night` : ''}
                {u.base_rate_short && u.base_rate_long ? ' · ' : ''}
                {u.base_rate_long ? `GHS ${u.base_rate_long}/mo` : ''}
              </div>
            </div>
          </Link>
        ))}
        {units.length === 0 && <div className="text-stone col-span-full">No units yet.</div>}
      </div>
    </div>
  );
}
