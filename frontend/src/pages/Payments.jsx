import { useEffect, useState } from 'react';
import { getPayments, createPayment, getLeases, getBillingSummary, generateCharges, flagLatePayments } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { lease_id: '', amount: '', due_date: '', payment_date: '', status: 'paid', method: 'mobile_money' };

export default function Payments() {
  const { canEdit } = useAuth();
  const [payments, setPayments] = useState([]);
  const [leases, setLeases] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState('');

  const load = () => getPayments().then(setPayments);
  const loadSummary = () => getBillingSummary().then(setSummary);

  useEffect(() => {
    load();
    loadSummary();
    getLeases().then(setLeases);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createPayment(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
      loadSummary();
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setBillingBusy(true);
    setBillingMsg('');
    try {
      const res = await generateCharges();
      setBillingMsg(`Generated ${res.generated_count} charge${res.generated_count === 1 ? '' : 's'} for this period.`);
      load();
      loadSummary();
    } finally {
      setBillingBusy(false);
    }
  };

  const handleFlagLate = async () => {
    setBillingBusy(true);
    setBillingMsg('');
    try {
      const res = await flagLatePayments();
      setBillingMsg(`Flagged ${res.flagged_count} overdue payment${res.flagged_count === 1 ? '' : 's'} as late.`);
      load();
      loadSummary();
    } finally {
      setBillingBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Every cedi collected, tied to a lease, tenant, and unit.</p>
        {canEdit && (
          <button onClick={() => setShowForm((s) => !s)} className="lx-btn-primary w-full sm:w-auto">
            {showForm ? 'Cancel' : '+ Log Payment'}
          </button>
        )}
      </div>

      {canEdit && (
        <div className="lx-card p-5 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-6">
              <div>
                <div className="lx-eyebrow mb-1">Pending</div>
                <div className="text-lg font-sans font-bold text-ink">
                  {summary ? summary.pending_count : '—'}
                  <span className="text-xs text-stone font-normal ml-1.5">
                    {summary ? `GHS ${summary.pending_total.toLocaleString()}` : ''}
                  </span>
                </div>
              </div>
              <div>
                <div className="lx-eyebrow mb-1">Late</div>
                <div className="text-lg font-sans font-bold text-rose-600">
                  {summary ? summary.late_count : '—'}
                  <span className="text-xs text-stone font-normal ml-1.5">
                    {summary ? `GHS ${summary.late_total.toLocaleString()}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col xs:flex-row gap-2">
              <button onClick={handleGenerate} disabled={billingBusy} className="lx-btn-ghost !py-2 text-xs whitespace-nowrap">
                {billingBusy ? 'Working…' : 'Generate this period’s charges'}
              </button>
              <button onClick={handleFlagLate} disabled={billingBusy} className="lx-btn-ghost !py-2 text-xs whitespace-nowrap">
                Flag late payments
              </button>
            </div>
          </div>
          {billingMsg && <p className="text-xs text-stone mt-3">{billingMsg}</p>}
          <p className="text-[11px] text-stone-light mt-2">
            Generates a pending payment for every active long-stay lease not yet billed this month/year. Short-stay
            (nightly) bookings are paid at time of stay and aren&apos;t auto-billed.
          </p>
        </div>
      )}

      {canEdit && showForm && (
        <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <select required className="lx-select sm:col-span-3" value={form.lease_id}
            onChange={(e) => setForm({ ...form, lease_id: e.target.value })}>
            <option value="">Select lease…</option>
            {leases.map((l) => (
              <option key={l.id} value={l.id}>
                {l.stay_type} · {l.start_date} → {l.end_date || 'ongoing'} · GHS {l.agreed_rate}/{l.rate_period}
              </option>
            ))}
          </select>
          <input type="number" required placeholder="Amount" className="lx-input"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="lx-select" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="late">Late</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
          </select>
          <select className="lx-select" value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="mobile_money">Mobile money</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
          <input type="date" placeholder="Due date" className="lx-input"
            value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <input type="date" placeholder="Payment date" className="lx-input"
            value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
          <button disabled={saving} className="lx-btn-gold sm:col-span-3 justify-self-start w-full sm:w-auto">
            {saving ? 'Saving…' : 'Log Payment'}
          </button>
        </form>
      )}

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[500px]">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_date || p.due_date}</td>
                  <td className="text-right">GHS {p.amount}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="capitalize">{p.method?.replace('_', ' ') || '—'}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-stone">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
