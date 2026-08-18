import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicUnit, createInquiry } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Slideshow from '../components/Slideshow.jsx';
import { formatMoney } from '../utils/currency.js';
import { LAYOUT_FIELDS, FINISH_FIELDS, BUILDING_FIELDS, furnishingLabel, areaLabel } from '../data/specs.js';

const emptyInquiry = { name: '', email: '', phone: '', start_date: '', end_date: '', message: '' };

// Public, unauthenticated — the per-unit link meant to be shared directly
// (e.g. one Instagram post per listing). Only ever calls /api/public/*.
export default function ShowcaseDetail() {
  const { slug, id } = useParams();
  const [unit, setUnit] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyInquiry);
  const [sending, setSending] = useState(false);
  const [inquiryType, setInquiryType] = useState('booking');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicUnit(slug, id)
      .then(setUnit)
      .catch(() => setNotFound(true));
  }, [slug, id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await createInquiry(slug, id, { ...form, inquiry_type: inquiryType });
      setSent(true);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-panel px-4">
        <div className="text-center">
          <p className="text-stone mb-3">This listing isn&apos;t available.</p>
          <Link to={`/showcase/${slug}`} className="text-gold hover:underline text-sm">
            ← Back to all listings
          </Link>
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-panel">
        <p className="text-stone text-sm">Loading&hellip;</p>
      </div>
    );
  }

  const photos = unit.photo_urls?.length ? unit.photo_urls : unit.photo_url ? [unit.photo_url] : [];
  const isVacant = unit.status === 'vacant';

  return (
    <div className="min-h-screen bg-panel">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8">
        <Link to={`/showcase/${slug}`} className="text-sm text-stone hover:text-ink mb-4 inline-block">
          ← All listings
        </Link>

        <div className="lx-card overflow-hidden mb-6">
          <Slideshow photos={photos} alt={unit.property_name} heightClass="h-72 sm:h-96" />
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="pill uppercase bg-stone/10 text-stone">{unit.class}</span>
              <StatusBadge status={isVacant ? 'vacant' : 'occupied'} />
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl text-ink mb-1">{unit.property_name}</h1>
            <p className="text-stone text-sm mb-4">
              {unit.unit_type}
              {unit.city ? ` · ${unit.city}` : ''}
              {areaLabel(unit.floor_area, unit.floor_area_unit) ? ` · ${areaLabel(unit.floor_area, unit.floor_area_unit)}` : ''}
              {furnishingLabel(unit.furnishing) ? ` · ${furnishingLabel(unit.furnishing)}` : ''}
            </p>

            {unit.description && <p className="text-sm text-ink/80 mb-5 leading-relaxed">{unit.description}</p>}

            {unit.listing_type !== 'rent' && unit.sale_price && (
              <div className="mb-6 pb-6 border-b border-line/70">
                <div className="lx-eyebrow mb-1">
                  {unit.sale_status === 'sold' ? 'Sold' : unit.sale_status === 'under_offer' ? 'Under offer' : 'For sale'}
                </div>
                <div className="font-serif text-2xl text-ink">
                  {formatMoney(unit.sale_price, unit.sale_currency || unit.currency)}
                </div>
              </div>
            )}

            {unit.listing_type !== 'sale' && (unit.base_rate_short || unit.base_rate_long) && (
              <div className="flex flex-wrap gap-5 text-sm text-stone mb-6 pb-6 border-b border-line/70">
                {unit.base_rate_short && (
                  <div>
                    <span className="text-ink font-medium">
                      {formatMoney(unit.base_rate_short, unit.currency)}
                    </span>{' '}
                    / night
                  </div>
                )}
                {unit.base_rate_long && (
                  <div>
                    <span className="text-ink font-medium">
                      {formatMoney(unit.base_rate_long, unit.currency)}
                    </span>{' '}
                    / month
                  </div>
                )}
              </div>
            )}

            {/* Layout counts */}
            {LAYOUT_FIELDS.some((f) => unit[f.key]) && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
                {LAYOUT_FIELDS.filter((f) => unit[f.key]).map((f) => (
                  <div key={f.key} className="bg-panel rounded-xl px-3 py-2.5 text-center">
                    <div className="font-sans font-bold text-lg text-ink leading-none">{unit[f.key]}</div>
                    <div className="text-[11px] text-stone mt-1">{f.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Features */}
            {unit.features?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {unit.has_air_conditioning && <span className="pill bg-sky-50 text-sky-700">Air conditioning</span>}
                {unit.features.map((f) => (
                  <span key={f} className="pill bg-stone/10 text-stone">{f}</span>
                ))}
              </div>
            )}

            {/* Finishes */}
            {FINISH_FIELDS.some((f) => unit[f.key]) && (
              <div className="mb-6">
                <div className="lx-eyebrow mb-2">Finishes & fittings</div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {FINISH_FIELDS.filter((f) => unit[f.key]).map((f) => (
                    <div key={f.key} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                      <dt className="text-stone">{f.label}</dt>
                      <dd className="text-ink text-right">{unit[f.key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Building-level detail from the parent property */}
            {unit.l_properties && (
              <BuildingSection property={unit.l_properties} />
            )}

            {sent ? (
              <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
                Thanks — your request has been sent. Someone will reach out to you shortly.
              </div>
            ) : showForm ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                {inquiryType === 'booking' && !isVacant && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    This unit is currently occupied — send a request and we&apos;ll reach out if it becomes available.
                  </p>
                )}
                {inquiryType === 'purchase' && unit.sale_status === 'under_offer' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    This property is already under offer — register your interest and we&apos;ll be in touch if that changes.
                  </p>
                )}
                {error && (
                  <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">{error}</div>
                )}
                <input
                  required
                  placeholder="Your name"
                  className="lx-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    placeholder="Email"
                    className="lx-input"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <input
                    placeholder="Phone"
                    className="lx-input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <p className="text-xs text-stone">Provide at least an email or phone number so we can reach you.</p>
                {/* Stay dates are meaningless on a purchase enquiry, so
                    the form asks for an offer instead. */}
                {inquiryType === 'purchase' ? (
                  <div>
                    <label className="block text-xs text-stone mb-1">Your offer (optional)</label>
                    <input
                      type="number"
                      placeholder="Leave blank to simply register interest"
                      className="lx-input"
                      value={form.offer_amount || ''}
                      onChange={(e) => setForm({ ...form, offer_amount: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-stone mb-1">Move-in / check-in date</label>
                      <input
                        type="date"
                        className="lx-input"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone mb-1">Check-out date (optional)</label>
                      <input
                        type="date"
                        className="lx-input"
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                <textarea
                  placeholder="Anything else we should know?"
                  className="lx-input"
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
                <div className="flex gap-3">
                  <button disabled={sending} className="lx-btn-primary">
                    {sending ? 'Sending…' : inquiryType === 'purchase' ? 'Send enquiry' : 'Send request'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="lx-btn-ghost">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex gap-3 flex-wrap">
                {unit.listing_type !== 'sale' && (
                  <button onClick={() => { setInquiryType('booking'); setShowForm(true); }} className="lx-btn-primary">
                    {isVacant ? 'Book now' : 'Request to be notified'}
                  </button>
                )}
                {unit.listing_type !== 'rent' && unit.sale_status !== 'sold' && (
                  <button
                    onClick={() => { setInquiryType('purchase'); setShowForm(true); }}
                    className={unit.listing_type === 'sale' ? 'lx-btn-primary' : 'lx-btn-ghost'}
                  >
                    {unit.sale_status === 'under_offer' ? 'Register interest' : 'Enquire about buying'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Building-level detail, joined from the unit's parent property. Gives a
// shared listing real substance beyond the apartment itself.
function BuildingSection({ property }) {
  const rows = BUILDING_FIELDS.filter((f) => property[f.key]);
  const hasAnything = rows.length || property.amenities?.length || property.description;
  if (!hasAnything) return null;

  return (
    <div className="mb-6 pt-5 border-t border-line/70">
      <div className="lx-eyebrow mb-2">About the building</div>
      {property.description && <p className="text-sm text-ink/80 mb-3 leading-relaxed">{property.description}</p>}

      {rows.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-3">
          {rows.map((f) => (
            <div key={f.key} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
              <dt className="text-stone">{f.label}</dt>
              <dd className="text-ink text-right">{property[f.key]}</dd>
            </div>
          ))}
        </dl>
      )}

      {property.amenities?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {property.amenities.map((a) => (
            <span key={a} className="pill bg-emerald-50 text-emerald-700">{a}</span>
          ))}
        </div>
      )}
    </div>
  );
}
