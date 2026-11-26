import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicUnits } from '../api/client.js';
import Slideshow from '../components/Slideshow.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import { formatMoney } from '../utils/currency.js';
import { areaLabel } from '../data/specs.js';

// Public, unauthenticated portfolio — the branded "all my homes" link.
// Airbnb-style: photo-first cards, a search box and simple type chips.
export default function Showcase() {
  const { slug } = useParams();
  const [units, setUnits] = useState(null);
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState('GHS');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');

  useEffect(() => {
    getPublicUnits(slug)
      .then((res) => { setUnits(res.units); setCompany(res.company); setCurrency(res.currency || 'GHS'); })
      .catch((err) =>
        setError(err?.response?.status === 404
          ? "This link doesn't exist."
          : "Couldn't load listings right now — please try again shortly."));
  }, [slug]);

  const types = useMemo(() => Array.from(new Set((units || []).map((u) => u.unit_type).filter(Boolean))), [units]);

  const q = query.trim().toLowerCase();
  const shown = (units || []).filter((u) =>
    (type === 'all' || u.unit_type === type) &&
    (!q || [u.property_name, u.unit_type, u.city].some((v) => String(v || '').toLowerCase().includes(q))));

  const priceLine = (u) => {
    if (u.listing_type === 'sale' && u.sale_price) return <><span className="font-semibold text-ink">{formatMoney(u.sale_price, u.sale_currency || currency)}</span></>;
    if (u.base_rate_long) return <><span className="font-semibold text-ink">{formatMoney(u.base_rate_long, currency)}</span> <span className="text-stone">/ month</span></>;
    if (u.base_rate_short) return <><span className="font-semibold text-ink">{formatMoney(u.base_rate_short, currency)}</span> <span className="text-stone">/ night</span></>;
    return <span className="text-stone">Enquire for price</span>;
  };

  return (
    <div className="lx-public min-h-screen">
      <PublicHeader company={company} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="font-serif text-2xl sm:text-3xl text-ink">Available homes</h1>
          <p className="text-stone text-sm mt-1">
            {company?.name ? `Places to stay from ${company.name}. ` : ''}Tap any home for photos, details and to book.
          </p>
        </div>

        {error && <div className="lx-alert lx-alert-danger mb-6">{error}</div>}
        {!units && !error && <p className="text-stone text-sm">Loading&hellip;</p>}

        {units && units.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-7">
            <div className="relative flex-1 sm:max-w-sm">
              <svg viewBox="0 0 24 24" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-light pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or location…"
                className="w-full bg-canvas border border-line rounded-full pl-10 pr-4 py-2.5 text-sm text-ink shadow-soft focus:outline-none focus:ring-2 focus:ring-gold/25 focus:border-gold/50 transition" />
            </div>
            {types.length > 1 && (
              <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
                {['all', ...types].map((t) => (
                  <button key={t} onClick={() => setType(t)}
                    className={`px-4 py-2 rounded-full text-sm whitespace-nowrap capitalize transition border ${
                      type === t ? 'bg-ink text-white border-ink font-medium' : 'bg-canvas text-stone border-line hover:border-ink/30 hover:text-ink'
                    }`}>
                    {t === 'all' ? 'All homes' : t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {units && shown.length === 0 && !error && (
          <p className="text-stone text-sm">{units.length === 0 ? 'No homes available right now.' : 'Nothing matches that search.'}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
          {shown.map((u) => {
            const photos = u.photo_urls?.length ? u.photo_urls : u.photo_url ? [u.photo_url] : [];
            const specs = [
              u.bedrooms && `${u.bedrooms} bed`,
              u.bathrooms && `${u.bathrooms} bath`,
              areaLabel(u.floor_area, u.floor_area_unit),
            ].filter(Boolean).join(' · ');
            return (
              <Link key={u.id} to={`/showcase/${slug}/${u.id}`} className="group block">
                <div className="rounded-2xl overflow-hidden mb-3 shadow-soft group-hover:shadow-lift transition">
                  <Slideshow photos={photos} alt={u.property_name} heightClass="aspect-[4/3]" />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink truncate">{u.property_name}</div>
                    <div className="text-sm text-stone truncate">
                      {u.city || u.unit_type}{u.class === 'luxury' ? ' · Luxury' : u.class === 'premium' ? ' · Premium' : ''}
                    </div>
                  </div>
                </div>
                {specs && <div className="text-sm text-stone mt-0.5">{specs}</div>}
                <div className="text-sm mt-1.5">{priceLine(u)}</div>
              </Link>
            );
          })}
        </div>

        <footer className="mt-14 pt-6 border-t border-line text-xs text-stone-light">
          {company?.name || 'Lintel'}{company?.city ? ` · ${company.city}` : ''}
          {(company?.phone || company?.email) ? ` · ${[company.phone, company.email].filter(Boolean).join(' · ')}` : ''}
        </footer>
      </main>
    </div>
  );
}
