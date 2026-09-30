import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicUnit, createInquiry } from '../api/client.js';
import Slideshow from '../components/Slideshow.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { formatMoney } from '../utils/currency.js';
import { FINISH_FIELDS, BUILDING_FIELDS, furnishingLabel, areaLabel } from '../data/specs.js';

const emptyInquiry = { name: '', email: '', phone: '', start_date: '', end_date: '', message: '', offer_amount: '' };

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="text-gold shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Public, unauthenticated single-property page — the per-property share link.
// Shows ONLY this home (gallery, details, amenities) with a booking/enquire
// card. Airbnb-style, always light (via .lx-public).
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
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    getPublicUnit(slug, id).then(setUnit).catch(() => setNotFound(true));
  }, [slug, id]);

  const openForm = (type) => { setInquiryType(type); setSent(false); setError(''); setShowForm(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSending(true);
    try {
      await createInquiry(slug, id, { ...form, inquiry_type: inquiryType });
      setSent(true); setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally { setSending(false); }
  };

  if (notFound) {
    return (
      <div className="lx-public min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-stone mb-3">This home isn&apos;t available.</p>
          <a href={`/showcase/${slug}`} className="text-gold hover:underline text-sm">← See other homes</a>
        </div>
      </div>
    );
  }
  if (!unit) {
    return <div className="lx-public min-h-screen flex items-center justify-center"><p className="text-stone text-sm">Loading&hellip;</p></div>;
  }

  const photos = unit.photo_urls?.length ? unit.photo_urls : unit.photo_url ? [unit.photo_url] : [];
  const isVacant = unit.status === 'vacant';
  const isSale = unit.listing_type === 'sale';
  const property = unit.l_properties;

  const specsLine = [
    unit.unit_type,
    unit.city,
    unit.bedrooms && `${unit.bedrooms} bed`,
    unit.bathrooms && `${unit.bathrooms} bath`,
    areaLabel(unit.floor_area, unit.floor_area_unit),
    furnishingLabel(unit.furnishing),
  ].filter(Boolean).join('  ·  ');

  // Amenities = building amenities + unit features + AC, de-duplicated.
  const amenities = Array.from(new Set([
    ...(unit.has_air_conditioning ? ['Air conditioning'] : []),
    ...(property?.amenities || []),
    ...(unit.features || []),
  ]));

  const priceBlock = () => {
    if (isSale && unit.sale_price) return (
      <div><div className="text-2xl font-semibold text-ink">{formatMoney(unit.sale_price, unit.sale_currency || unit.currency)}</div>
        <div className="text-sm text-stone">{unit.sale_status === 'under_offer' ? 'Under offer' : 'For sale'}</div></div>
    );
    return (
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {unit.base_rate_long && <div><span className="text-2xl font-semibold text-ink">{formatMoney(unit.base_rate_long, unit.currency)}</span> <span className="text-sm text-stone">/ month</span></div>}
        {unit.base_rate_short && <div className="text-sm text-stone">{formatMoney(unit.base_rate_short, unit.currency)} / night</div>}
        {!unit.base_rate_long && !unit.base_rate_short && <div className="text-lg font-medium text-ink">Enquire for price</div>}
      </div>
    );
  };

  const ctaLabel = isSale ? (unit.sale_status === 'under_offer' ? 'Register interest' : 'Enquire to buy')
    : isVacant ? 'Book now' : 'Request to be notified';

  return (
    <div className="lx-public min-h-screen pb-24 lg:pb-0">
      <PublicHeader company={unit.company} backTo={`/showcase/${slug}`} backLabel="All homes" />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="font-serif text-2xl sm:text-3xl text-ink">{unit.property_name}</h1>
        <p className="text-stone text-sm mt-1.5">{specsLine}</p>

        {/* Gallery */}
        <div className="mt-4">
          {photos.length >= 5 ? (
            <div className="relative grid grid-cols-4 grid-rows-2 gap-2 h-[280px] sm:h-[440px] rounded-2xl overflow-hidden">
              <button onClick={() => setGalleryOpen(true)} className="col-span-2 row-span-2 group">
                <img src={photos[0]} alt={unit.property_name} className="w-full h-full object-cover group-hover:brightness-95 transition" />
              </button>
              {photos.slice(1, 5).map((p, i) => (
                <button key={i} onClick={() => setGalleryOpen(true)} className="group">
                  <img src={p} alt="" className="w-full h-full object-cover group-hover:brightness-95 transition" />
                </button>
              ))}
              <button onClick={() => setGalleryOpen(true)}
                className="absolute bottom-3 right-3 bg-canvas/95 border border-line rounded-lg px-3 py-1.5 text-xs font-medium text-ink shadow-soft hover:bg-panel">
                Show all photos
              </button>
            </div>
          ) : (
            <button onClick={() => photos.length && setGalleryOpen(true)} className="block w-full rounded-2xl overflow-hidden">
              <Slideshow photos={photos} alt={unit.property_name} heightClass="h-[280px] sm:h-[440px]" />
            </button>
          )}
        </div>

        {/* Two columns */}
        <div className="grid lg:grid-cols-[1fr_360px] gap-8 lg:gap-10 mt-8">
          <div className="min-w-0">
            {unit.description && (
              <>
                <p className="text-[15px] text-ink/85 leading-relaxed whitespace-pre-line">{unit.description}</p>
                <hr className="my-6 border-line" />
              </>
            )}

            {amenities.length > 0 && (
              <section className="mb-6">
                <h2 className="font-serif text-xl text-ink mb-3">What this home offers</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-6">
                  {amenities.map((a) => (
                    <div key={a} className="flex items-center gap-3 text-[15px] text-ink/85"><Check />{a}</div>
                  ))}
                </div>
                <hr className="my-6 border-line" />
              </section>
            )}

            {FINISH_FIELDS.some((f) => unit[f.key]) && (
              <section className="mb-6">
                <h2 className="font-serif text-xl text-ink mb-3">The space</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {FINISH_FIELDS.filter((f) => unit[f.key]).map((f) => (
                    <div key={f.key} className="flex justify-between gap-3 border-b border-line/70 pb-2">
                      <dt className="text-stone">{f.label}</dt><dd className="text-ink text-right">{unit[f.key]}</dd>
                    </div>
                  ))}
                </dl>
                <hr className="my-6 border-line" />
              </section>
            )}

            {property && (BUILDING_FIELDS.some((f) => property[f.key]) || property.description) && (
              <section className="mb-2">
                <h2 className="font-serif text-xl text-ink mb-3">About the building</h2>
                {property.description && <p className="text-[15px] text-ink/85 leading-relaxed mb-4 whitespace-pre-line">{property.description}</p>}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {BUILDING_FIELDS.filter((f) => property[f.key]).map((f) => (
                    <div key={f.key} className="flex justify-between gap-3 border-b border-line/70 pb-2">
                      <dt className="text-stone">{f.label}</dt><dd className="text-ink text-right">{property[f.key]}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>

          {/* Sticky booking card (desktop) */}
          <div className="hidden lg:block">
            <div className="lx-card p-6 sticky top-24 shadow-lift">
              {priceBlock()}
              <div className="mt-4">
                {sent ? (
                  <div className="lx-alert lx-alert-ok">Thanks — your request has been sent. {unit.company?.name || 'The host'} will reach out shortly.</div>
                ) : (
                  <button onClick={() => openForm(isSale ? 'purchase' : 'booking')} className="lx-btn-primary w-full !py-3">{ctaLabel}</button>
                )}
              </div>
              {!isVacant && !isSale && !sent && (
                <p className="text-xs text-stone mt-3 text-center">Currently occupied — we&apos;ll let you know when it frees up.</p>
              )}
              <p className="text-xs text-stone-light mt-3 text-center">No account needed · You won&apos;t be charged now</p>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile sticky booking bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-canvas/95 backdrop-blur border-t border-line px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">{priceBlock()}</div>
        {sent ? <span className="text-sm text-emerald-700 shrink-0">Request sent ✓</span>
          : <button onClick={() => openForm(isSale ? 'purchase' : 'booking')} className="lx-btn-primary !py-2.5 shrink-0">{ctaLabel}</button>}
      </div>

      {/* Inquiry modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-ink/50" />
          <div className="lx-public relative bg-canvas w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-lift p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="font-serif text-xl text-ink">{isSale ? 'Enquire about this home' : 'Request to book'}</h3>
              <button onClick={() => setShowForm(false)} aria-label="Close" className="text-stone hover:text-ink text-xl leading-none -mt-1">×</button>
            </div>
            <p className="text-sm text-stone mb-4">{unit.property_name}{unit.city ? ` · ${unit.city}` : ''}</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && <div className="lx-alert lx-alert-danger">{error}</div>}
              <TextField label="Your name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <TextField label="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <p className="text-xs text-stone">Add an email or phone so we can reach you.</p>
              {inquiryType === 'purchase' ? (
                <TextField label="Your offer" type="number" hint="Leave blank to simply register interest."
                  value={form.offer_amount} onChange={(e) => setForm({ ...form, offer_amount: e.target.value })} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Move-in / check-in" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  <TextField label="Check-out" type="date" hint="Optional." value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              )}
              <Field label="Anything else we should know?">
                <textarea className="lx-textarea" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </Field>
              <button disabled={sending} className="lx-btn-primary w-full !py-3">{sending ? 'Sending…' : isSale ? 'Send enquiry' : 'Send request'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Full-screen gallery */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 bg-ink/95 flex flex-col" onClick={() => setGalleryOpen(false)}>
          <div className="flex justify-end p-4">
            <button aria-label="Close" className="text-white/80 hover:text-white text-3xl leading-none">×</button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-w-4xl rounded-2xl overflow-hidden">
              <Slideshow photos={photos} alt={unit.property_name} heightClass="h-[70vh]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
