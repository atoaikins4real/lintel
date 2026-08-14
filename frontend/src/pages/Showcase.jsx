import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicUnits } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Slideshow from '../components/Slideshow.jsx';
import { formatMoney } from '../utils/currency.js';
import { areaLabel } from '../data/specs.js';

const CLASS_STYLE = {
  standard: 'bg-stone/10 text-stone',
  premium: 'bg-sky-50 text-sky-700',
  luxury: 'bg-gold/10 text-gold',
};

// Public, unauthenticated — this is the link meant to be shared on social
// media. Only ever calls /api/public/* endpoints.
export default function Showcase() {
  const { slug } = useParams();
  const [units, setUnits] = useState(null);
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState('GHS');
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicUnits(slug)
      .then((res) => {
        setUnits(res.units);
        setCompany(res.company);
        setCurrency(res.currency || 'GHS');
      })
      .catch((err) =>
        setError(
          err?.response?.status === 404
            ? "This showcase link doesn't exist."
            : "Couldn't load listings right now — please try again shortly."
        )
      );
  }, [slug]);

  return (
    <div className="min-h-screen bg-panel">
      <header className="bg-ink text-white py-10 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full pl-1.5 pr-3.5 py-1.5 mb-4">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="" className="w-5 h-5 rounded-md object-cover shrink-0" />
            ) : (
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-serif shrink-0"
                style={{ background: 'linear-gradient(160deg, #cf9e5c, #a9793a)' }}
              >
                {company?.name?.[0]?.toUpperCase() || 'L'}
              </span>
            )}
            <span className="text-xs font-medium">{company?.name || 'Lintel'}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl mb-2">Available Properties</h1>
          <p className="text-white/70 text-sm max-w-xl">
            Browse the current portfolio — tap any listing for photos, details, and to request a booking.
          </p>
          {(company?.phone || company?.email) && (
            <p className="text-white/50 text-xs mt-3">
              {[company.phone, company.email].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8">
        {error && (
          <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm mb-6">{error}</div>
        )}
        {!units && !error && <p className="text-stone text-sm">Loading&hellip;</p>}
        {units && units.length === 0 && <p className="text-stone text-sm">No listings available right now.</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {units?.map((u) => {
            const photos = u.photo_urls?.length ? u.photo_urls : u.photo_url ? [u.photo_url] : [];
            const isVacant = u.status === 'vacant';
            return (
              <Link key={u.id} to={`/showcase/${slug}/${u.id}`} className="lx-card overflow-hidden hover:shadow-lift transition block">
                <Slideshow photos={photos} alt={u.property_name} heightClass="h-48" />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`pill uppercase ${CLASS_STYLE[u.class] || CLASS_STYLE.standard}`}>{u.class}</span>
                    <StatusBadge status={isVacant ? 'vacant' : 'occupied'} />
                  </div>
                  <div className="font-serif text-lg text-ink">{u.property_name}</div>
                  <div className="text-sm text-stone">
                    {u.unit_type}
                    {u.city ? ` · ${u.city}` : ''}
                    {areaLabel(u.floor_area, u.floor_area_unit) ? ` · ${areaLabel(u.floor_area, u.floor_area_unit)}` : ''}
                  </div>
                  <div className="text-xs text-stone mt-1.5">
                    {[
                      u.bedrooms && `${u.bedrooms} bed`,
                      u.bathrooms && `${u.bathrooms} bath`,
                      u.halls && `${u.halls} hall`,
                      u.kitchens && `${u.kitchens} kitchen`,
                      u.storeys > 1 && `${u.storeys} storey`,
                    ].filter(Boolean).join(' · ') || 'Details coming soon'}
                  </div>
                  <div className="text-xs text-stone mt-3 pt-3 border-t border-line/70">
                    {u.base_rate_short ? `${formatMoney(u.base_rate_short, currency)}/night` : ''}
                    {u.base_rate_short && u.base_rate_long ? ' · ' : ''}
                    {u.base_rate_long ? `${formatMoney(u.base_rate_long, currency)}/mo` : ''}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
