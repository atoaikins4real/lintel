import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requestTenantLink, getMyStatement, initTenantPayment, verifyTenantPayment } from '../api/client.js';
import { formatMoney } from '../utils/currency.js';
import { TextField } from '../components/Field.jsx';

const PAYABLE = ['pending', 'late', 'partial'];

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

  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState('');
  const [payBanner, setPayBanner] = useState(null); // { tone, text }

  const reference = params.get('reference') || params.get('trxref');

  const loadStatement = () =>
    getMyStatement(token)
      .then(setStatement)
      .catch((err) =>
        setError(err?.response?.data?.error || "Couldn't load your statement. Please request a new link.")
      )
      .finally(() => setLoading(false));

  useEffect(() => {
    if (!token) return;
    loadStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Returning from Paystack: confirm the payment right away (the webhook is
  // authoritative, this is the instant-feedback fallback), then refresh.
  useEffect(() => {
    if (!token || !reference) return;
    verifyTenantPayment(token, reference)
      .then((res) => {
        if (res.status === 'success') {
          setPayBanner({ tone: 'good', text: 'Payment received — thank you. Your statement is updated below.' });
        } else if (res.status === 'mismatch') {
          setPayBanner({ tone: 'bad', text: 'We couldn’t match that payment. Please contact your landlord.' });
        } else {
          setPayBanner({ tone: 'wait', text: 'Payment is still processing. This page will reflect it once confirmed.' });
        }
      })
      .catch(() => setPayBanner({ tone: 'wait', text: 'Payment is still processing. Check back shortly.' }))
      .finally(() => loadStatement());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reference]);

  const pay = async (paymentId) => {
    setPayError('');
    setPayingId(paymentId);
    try {
      const { authorization_url } = await initTenantPayment(token, paymentId);
      window.location.href = authorization_url; // hand off to Paystack
    } catch (err) {
      setPayError(err?.response?.data?.error || 'Could not start the payment. Please try again.');
      setPayingId(null);
    }
  };

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
                <TextField
                  label="Email address" required type="email" hint="The address your landlord has on file."
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

            {payBanner && (
              <div
                className={`mb-5 text-sm rounded-xl px-4 py-3 border ${
                  payBanner.tone === 'good'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : payBanner.tone === 'bad'
                    ? 'text-rose-700 bg-rose-50 border-rose-200'
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}
              >
                {payBanner.text}
              </div>
            )}
            {payError && (
              <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                {payError}
              </div>
            )}

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

            {/* Mobile: stacked cards so a tenant can read the ledger on a phone.
                Hidden in print so a saved PDF always uses the full table. */}
            <div className="sm:hidden print:hidden space-y-2.5">
              {statement.payments.map((p, i) => (
                <div key={i} className="border border-line rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">{formatMoney(p.amount, p.currency)}</span>
                    <span className="text-xs capitalize text-stone">{p.status}</span>
                  </div>
                  <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-xs text-stone">
                    <span>Due {p.due_date || '—'}</span>
                    <span>Paid {p.payment_date || '—'}</span>
                    <span className="capitalize">{p.method?.replace('_', ' ') || 'No method'}</span>
                  </div>
                  {statement.online_payments && PAYABLE.includes(p.status) && p.id && (
                    <button
                      onClick={() => pay(p.id)}
                      disabled={payingId === p.id}
                      className="lx-btn-primary w-full mt-3 text-sm"
                    >
                      {payingId === p.id ? 'Starting…' : `Pay ${formatMoney(p.amount, p.currency)}`}
                    </button>
                  )}
                </div>
              ))}
              {statement.payments.length === 0 && (
                <div className="text-center text-stone text-sm py-6">No payments recorded yet.</div>
              )}
            </div>

            {/* Tablet + desktop / print: full table */}
            <div className="overflow-x-auto hidden sm:block print:block">
              <table className="w-full lx-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Paid</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                    {statement.online_payments && <th className="text-right print:hidden">Pay</th>}
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
                      {statement.online_payments && (
                        <td className="text-right print:hidden">
                          {PAYABLE.includes(p.status) && p.id ? (
                            <button
                              onClick={() => pay(p.id)}
                              disabled={payingId === p.id}
                              className="lx-btn-primary text-xs px-3 py-1.5"
                            >
                              {payingId === p.id ? 'Starting…' : 'Pay'}
                            </button>
                          ) : (
                            <span className="text-stone-light text-xs">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {statement.payments.length === 0 && (
                    <tr><td colSpan={statement.online_payments ? 6 : 5} className="px-5 py-8 text-center text-stone">No payments recorded yet.</td></tr>
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
