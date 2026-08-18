import { useEffect, useState } from 'react';
import {
  getPayments, createPayment, updatePayment, deletePayment,
  getLeases, getBillingSummary, generateCharges, flagLatePayments, readApiError,
} from '../api/client.js';
import { CURRENCY_LABELS } from '../utils/currency.js';
import StatusBadge from '../components/StatusBadge.jsx';
import RowActions from '../components/RowActions.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const emptyForm = {
  lease_id: '', amount: '', currency: '', due_date: '', payment_date: '', status: 'paid', method: 'mobile_money',
};

export default function Payments() {
  const { canEdit } = useAuth();
  const { money, currency } = useSettings();
  const [payments, setPayments] = useState([]);
  const [leases, setLeases] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  const startEdit = (p) => {
    if (editingId === p.id) return setEditingId(null);
    setEditingId(p.id);
    setEdit({
      amount: p.amount ?? '',
      status: p.status,
      method: p.method || '',
      payment_date: p.payment_date || '',
      due_date: p.due_date || '',
    });
  };

  const saveEdit = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await updatePayment(id, edit);
      setEditingId(null);
      load();
      loadSummary();
    } catch (err) {
      setError(readApiError(err, 'update that payment'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deletePayment(id);
      load();
      loadSummary();
    } catch (err) {
      setError(readApiError(err, 'delete that payment'));
    } finally {
      setBusyId(null);
    }
  };

  const load = () => getPayments().then(setPayments);
  const loadSummary = () => getBillingSummary().then(setSummary);

  const { query, setQuery, results: shownPayments } = useSearch(
    payments,
    ['reference', 'method', 'notes', 'status', 'payment_date', 'due_date'],
    (p) => !paymentStatusFilter || p.status === paymentStatusFilter
  );

  useEffect(() => {
    load();
    loadSummary();
    getLeases().then(setLeases);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      // Blank currency means "use the account default" — the backend
      // resolves it from Settings.
      await createPayment({ ...form, currency: form.currency || currency });
      setForm(emptyForm);
      setShowForm(false);
      load();
      loadSummary();
    } catch (err) {
      setError(readApiError(err, 'log that payment'));
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
        <p className="text-stone text-sm">Every payment collected, tied to a lease, tenant, and unit.</p>
        {canEdit && (
          <button onClick={() => setShowForm((s) => !s)} className="lx-btn-primary w-full sm:w-auto">
            {showForm ? 'Cancel' : '+ Log Payment'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {canEdit && (
        <div className="lx-card p-5 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-6">
              <div>
                <div className="lx-eyebrow mb-1">Pending</div>
                <div className="text-lg font-sans font-bold text-ink">
                  {summary ? summary.pending_count : '—'}
                  <span className="text-xs text-stone font-normal ml-1.5">
                    {summary ? money(summary.pending_total) : ''}
                  </span>
                </div>
              </div>
              <div>
                <div className="lx-eyebrow mb-1">Late</div>
                <div className="text-lg font-sans font-bold text-rose-600">
                  {summary ? summary.late_count : '—'}
                  <span className="text-xs text-stone font-normal ml-1.5">
                    {summary ? money(summary.late_total) : ''}
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
                {l.stay_type} · {l.start_date} → {l.end_date || 'ongoing'} · {money(l.agreed_rate)}/{l.rate_period}
              </option>
            ))}
          </select>
          <input type="number" required placeholder="Amount" className="lx-input"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="lx-select" value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="">{currency} (account default)</option>
            {Object.keys(CURRENCY_LABELS)
              .filter((c) => c !== currency)
              .map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
          </select>
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

      <SearchBar
        value={query} onChange={setQuery} placeholder="Search reference, method, notes…"
        count={shownPayments.length} total={payments.length}
      >
        <select className="lx-select !py-2 text-sm w-auto" value={paymentStatusFilter}
          onChange={(e) => setPaymentStatusFilter(e.target.value)}>
          <option value="">Any status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="late">Late</option>
          <option value="partial">Partial</option>
          <option value="refunded">Refunded</option>
        </select>
      </SearchBar>

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[500px]">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Method</th>
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shownPayments.map((p) => (
                <tr key={p.id}>
                  <td>
                    {editingId === p.id ? (
                      <input type="date" className="lx-input !py-1 text-xs"
                        value={edit.payment_date || ''}
                        onChange={(e) => setEdit({ ...edit, payment_date: e.target.value })} />
                    ) : (
                      p.payment_date || p.due_date
                    )}
                  </td>
                  <td className="text-right">
                    {editingId === p.id ? (
                      <input type="number" className="lx-input !py-1 text-xs w-28 text-right"
                        value={edit.amount ?? ''}
                        onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
                    ) : (
                      money(p.amount, p.currency)
                    )}
                  </td>
                  <td>
                    {editingId === p.id ? (
                      <select className="lx-select !py-1 text-xs" value={edit.status}
                        onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                        <option value="paid">Paid</option>
                        <option value="partial">Partial</option>
                        <option value="late">Late</option>
                        <option value="pending">Pending</option>
                        <option value="refunded">Refunded</option>
                      </select>
                    ) : (
                      <StatusBadge status={p.status} />
                    )}
                  </td>
                  <td className="capitalize">
                    {editingId === p.id ? (
                      <select className="lx-select !py-1 text-xs" value={edit.method || ''}
                        onChange={(e) => setEdit({ ...edit, method: e.target.value })}>
                        <option value="">—</option>
                        <option value="mobile_money">Mobile money</option>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank transfer</option>
                      </select>
                    ) : (
                      p.method?.replace('_', ' ') || '—'
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {editingId === p.id && (
                          <button onClick={() => saveEdit(p.id)} disabled={busyId === p.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-ink text-white">
                            {busyId === p.id ? 'Saving…' : 'Save'}
                          </button>
                        )}
                        <RowActions
                          editing={editingId === p.id}
                          busy={busyId === p.id}
                          onEdit={() => startEdit(p)}
                          onDelete={() => remove(p.id)}
                          deleteLabel="Delete this payment?"
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {shownPayments.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-5 py-10 text-center text-stone">
                    {payments.length === 0 ? 'No payments yet.' : 'Nothing matches that search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
