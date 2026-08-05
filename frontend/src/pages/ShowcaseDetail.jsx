import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicUnit, createInquiry } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Slideshow from '../components/Slideshow.jsx';

const emptyInquiry = { name: '', email: '', phone: '', start_date: '', end_date: '', message: '' };

// Public, unauthenticated — the per-unit link meant to be shared directly
// (e.g. one Instagram post per listing). Only ever calls /api/public/*.
export default function ShowcaseDetail() {
  const { id } = useParams();
  const [unit, setUnit] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyInquiry);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPublicUnit(id)
      .then(setUnit)
      .catch(() => setNotFound(true));
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await createInquiry(id, form);
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
          <Link to="/showcase" className="text-gold hover:underline text-sm">
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
        <Link to="/showcase" className="text-sm text-stone hover:text-ink mb-4 inline-block">
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
            <p className="text-stone text-sm mb-5">
              {unit.unit_type}
              {unit.city ? ` · ${unit.city}` : ''} · {unit.bedrooms ?? '–'} bed / {unit.bathrooms ?? '–'} bath
            </p>

            {(unit.base_rate_short || unit.base_rate_long) && (
              <div className="flex flex-wrap gap-5 text-sm text-stone mb-6 pb-6 border-b border-line/70">
                {unit.base_rate_short && (
                  <div>
                    <span className="text-ink font-medium">GHS {unit.base_rate_short}</span> / night
                  </div>
                )}
                {unit.base_rate_long && (
                  <div>
                    <span className="text-ink font-medium">GHS {unit.base_rate_long}</span> / month
                  </div>
                )}
              </div>
            )}

            {sent ? (
              <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
                Thanks — your request has been sent. Someone will reach out to you shortly.
              </div>
            ) : showForm ? (
              <form onSubmit={handleSubmit} className="space-y-3">
                {!isVacant && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    This unit is currently occupied — send a request and we&apos;ll reach out if it becomes available.
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
                <textarea
                  placeholder="Anything else we should know?"
                  className="lx-input"
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
                <div className="flex gap-3">
                  <button disabled={sending} className="lx-btn-primary">
                    {sending ? 'Sending…' : 'Send request'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="lx-btn-ghost">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowForm(true)} className="lx-btn-primary">
                {isVacant ? 'Book now' : 'Request to be notified'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
