import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requestTenantLink, getMyStatement } from '../api/client.js';
import { formatMoney } from '../utils/currency.js';

// Public tenant-facing page. Two modes: request a link, or view the
// statement the link grants. No login — see backend/src/routes/tenantPortal.js
// for why.
export default function MyStatement() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    getMyStatement(token)
      .then(setStatement)
      .catch((err) =>
        setError(err?.response?.data?.error || "Couldn't load your statement. Please request a new link.")
      )
      .finally(() => setLoading(false));
  }, [token]);

  const request = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const res = await requestTenantLink(email.trim());
      setSentMessage(res.message);
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const currency = statement?.payments?.[0]?.currency || 'GHS';
  const m = (v) => formatMoney(v, currency);

  return (
    <div className="min-h-screen bg-panel">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-10">
        {/* ---------- Request a link ---------- */}
        {!token && (
          <div className="lx-card p-6 sm:p-8 max-w-md mx-auto">
            <h1 className="font-serif text-2xl text-ink mb-1">View your statement</h1>
            <p className="text-stone text-xs mb-6">
              Enter the email address your landlord has on file and we&apos;ll send you a private link.
            </p>

            {sentMessage ? (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                {sentMessage}
              </div>
            ) : (
              <form onSubmit={request} className="space-y-3">
                {error && (
                  <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}
                <input
                  required type="email" placeholder="you@example.com" className="lx-input"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                />
                <button disabled={sending} className="lx-btn-primary w-full">
                  {sending ? 'Sending…' : 'Email me my statement link'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ---------- Statement ---------- */}
        {token && loading && <p className="text-stone text-sm text-center py-10">Loading…</p>}

        {token && !loading && error && (
          <div className="lx-card p-6 max-w-md mx-auto text-center">
            <p className="text-sm text-rose-700 mb-4">{error}</p>
            <a href="/my-statement" className="lx-btn-primary inline-block">Request a new link</a>
          </div>
        )}

        {statement && (
          <div className="lx-card p-6 sm:p-8">
            <div className="flex justify-between gap-6 flex-wrap mb-6 pb-6 border-b border-line">
              <div className="flex items-center gap-3">
                {statement.company?.logo_url && (
                  <img src={statement.company.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                )}
                <div>
                  <div className="font-serif text-xl text-ink">{statement.company?.name}</div>
                  <div className="text-xs text-stone">
                    {[statement.company?.phone, statement.company?.email].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="lx-eyebrow mb-1">Statement for</div>
                <div className="font-medium text-ink">
                  {statement.tenant.first_name} {statement.tenant.last_name}
                </div>
                <div className="text-xs text-stone">{statement.tenant.lintel_id}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <Total label="Charged" value={m(statement.totals.charged)} />
              <Total label="Paid" value={m(statement.totals.paid)} />
              <Total
                label="Outstanding"
                value={m(statement.totals.outstanding)}
                tone={statement.totals.outstanding > 0 ? 'bad' : 'good'}
              />
            </div>

            {statement.leases.length > 0 && (
              <div className="mb-6">
                <div className="lx-eyebrow mb-2">Your tenancies</div>
                <ul className="text-sm space-y-1.5">
                  {statement.leases.map((l, i) => (
                    <li key={i} className="flex justify-between gap-4 border-b border-line/60 pb-1.5 flex-wrap">
                      <span>{l.unit} — {l.property}</span>
                      <span className="text-stone text-xs">
                        {l.start_date} → {l.end_date || 'ongoing'} · {m(l.agreed_rate)}/{l.rate_period} · {l.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="lx-eyebrow mb-2">Payments</div>
            <div className="overflow-x-auto">
              <table className="w-full lx-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Paid</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.payments.map((p, i) => (
                    <tr key={i}>
                      <td className="text-xs">{p.due_date || '—'}</td>
                      <td className="text-xs">{p.payment_date || '—'}</td>
                      <td className="text-xs capitalize">{p.method?.replace('_', ' ') || '—'}</td>
                      <td className="text-xs capitalize">{p.status}</td>
                      <td className="text-right">{formatMoney(p.amount, p.currency)}</td>
                    </tr>
                  ))}
                  {statement.payments.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-stone">No payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-6 print:hidden">
              <button onClick={() => window.print()} className="lx-btn-ghost text-xs">
                Print / save as PDF
              </button>
            </div>

            <p className="text-[11px] text-stone-light mt-5">
              Questions about anything here? Contact{' '}
              {statement.company?.name || 'your landlord'}
              {statement.company?.email ? ` at ${statement.company.email}` : ''}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Total({ label, value, tone }) {
  const colour = tone === 'bad' ? 'text-rose-700' : tone === 'good' ? 'text-emerald-700' : 'text-ink';
  return (
    <div className="bg-panel rounded-xl px-3 py-2.5 text-center">
      <div className="text-[11px] text-stone mb-0.5">{label}</div>
      <div className={`font-sans font-bold ${colour}`}>{value}</div>
    </div>
  );
}
