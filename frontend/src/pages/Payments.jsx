import { useEffect, useState } from 'react';
import {
  getPayments, createPayment, updatePayment, deletePayment,
  getLeases, getBillingSummary, generateCharges, flagLatePayments, readApiError,
} from '../api/client.js';
import { CURRENCY_LABELS } from '../utils/currency.js';
import StatusBadge from '../components/StatusBadge.jsx';
import StatCard from '../components/StatCard.jsx';
import RowActions from '../components/RowActions.jsx';
import SidePanel from '../components/SidePanel.jsx';
import Tabs from '../components/Tabs.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { IconWallet, IconChart, IconTrendDown } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const emptyForm = {
  lease_id: '', amount: '', currency: '', due_date: '', payment_date: '', status: 'paid', method: 'mobile_money',
};
const STATUSES = [['paid', 'Paid'], ['pending', 'Pending'], ['late', 'Late'], ['partial', 'Partial'], ['refunded', 'Refunded']];
const METHODS = [['mobile_money', 'Mobile money'], ['cash', 'Cash'], ['card', 'Card'], ['bank_transfer', 'Bank transfer']];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const methodLabel = (m) => METHODS.find(([v]) => v === m)?.[1] || (m ? m.replace(/_/g, ' ') : '—');

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-light pointer-events-none"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input className="lx-input pl-9 pr-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone hover:text-ink text-base leading-none">×</button>}
    </div>
  );
}

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

  const [tab, setTab] = useState('payments');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  const load = () => getPayments().then(setPayments);
  const loadSummary = () => getBillingSummary().then(setSummary);

  useEffect(() => { load(); loadSummary(); getLeases().then(setLeases); }, []);

  const startEdit = (p) => {
    if (editingId === p.id) return setEditingId(null);
    setEditingId(p.id);
    setEdit({ amount: p.amount ?? '', status: p.status, method: p.method || '', payment_date: p.payment_date || '', due_date: p.due_date || '' });
  };
  const saveEdit = async (id) => {
    setError(''); setBusyId(id);
    try { await updatePayment(id, edit); setEditingId(null); load(); loadSummary(); }
    catch (err) { setError(readApiError(err, 'update that payment')); } finally { setBusyId(null); }
  };
  const remove = async (id) => {
    setError(''); setBusyId(id);
    try { await deletePayment(id); load(); loadSummary(); }
    catch (err) { setError(readApiError(err, 'delete that payment')); } finally { setBusyId(null); }
  };
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSaving(true);
    try {
      await createPayment({ ...form, currency: form.currency || currency });
      setForm(emptyForm); setShowForm(false); load(); loadSummary();
    } catch (err) { setError(readApiError(err, 'log that payment')); } finally { setSaving(false); }
  };
  const handleGenerate = async () => {
    setBillingBusy(true); setBillingMsg('');
    try { const res = await generateCharges(); setBillingMsg(`Generated ${res.generated_count} charge${res.generated_count === 1 ? '' : 's'} for this period.`); load(); loadSummary(); }
    finally { setBillingBusy(false); }
  };
  const handleFlagLate = async () => {
    setBillingBusy(true); setBillingMsg('');
    try { const res = await flagLatePayments(); setBillingMsg(`Flagged ${res.flagged_count} overdue payment${res.flagged_count === 1 ? '' : 's'} as late.`); load(); loadSummary(); }
    finally { setBillingBusy(false); }
  };

  // ---- derived ----
  const countBy = (keyFn) => payments.reduce((m, p) => { const k = keyFn(p); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const byStatus = countBy((p) => p.status);
  const byMethod = countBy((p) => p.method);
  const sumWhere = (pred) => payments.filter(pred).reduce((s, p) => s + num(p.amount), 0);

  const collected = sumWhere((p) => p.status === 'paid');
  const paidCount = byStatus.paid || 0;
  const pendingCount = byStatus.pending || 0;
  const lateCount = byStatus.late || 0;

  const s = search.trim().toLowerCase();
  const shownPayments = payments.filter((p) =>
    (!statusFilter || p.status === statusFilter) &&
    (!methodFilter || p.method === methodFilter) &&
    (!s || [p.reference, p.method, p.notes, p.status, p.payment_date, p.due_date].some((v) => String(v || '').toLowerCase().includes(s))));

  const facet = (label, current, setVal, options) => ({
    label,
    items: [
      { key: '__all', label: 'All', count: options.reduce((t, o) => t + o.count, 0), active: !current, onClick: () => setVal('') },
      ...options.map((o) => ({ key: o.key, label: o.label, count: o.count, active: current === o.key, onClick: () => setVal(o.key) })),
    ],
  });
  const statusOpts = STATUSES.filter(([v]) => byStatus[v]).map(([v, l]) => ({ key: v, label: l, count: byStatus[v] }));
  const methodOpts = METHODS.filter(([v]) => byMethod[v]).map(([v, l]) => ({ key: v, label: l, count: byMethod[v] }));
  const sideGroups = [
    facet('Status', statusFilter, setStatusFilter, statusOpts.length ? statusOpts : STATUSES.map(([v, l]) => ({ key: v, label: l, count: 0 }))),
    methodOpts.length ? facet('Method', methodFilter, setMethodFilter, methodOpts) : null,
  ].filter(Boolean);

  const tabs = [
    { key: 'payments', label: 'Payments', count: payments.length },
    ...(canEdit ? [{ key: 'billing', label: 'Billing' }] : []),
  ];

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {/* KPI hero */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard label="Collected" value={money(collected)} icon={IconWallet} sub={`${paidCount} paid`} />
        <StatCard label="Pending" value={pendingCount} icon={IconChart} sub={money(sumWhere((p) => p.status === 'pending'))} />
        <StatCard label="Overdue" value={lateCount} icon={IconTrendDown} sub={money(sumWhere((p) => p.status === 'late'))}
          trend={lateCount > 0 ? { direction: 'down', value: 'late' } : undefined} />
      </div>

      <div className="grid lg:grid-cols-[236px_1fr] gap-5 lg:gap-6 items-start">
        <SidePanel title="Payments" groups={sideGroups} />

        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3 mb-4">
            <Tabs tabs={tabs} value={tab} onChange={setTab} />
            {tab === 'payments' && canEdit && (
              <button type="button" onClick={() => setShowForm((v) => !v)} className="lx-btn-primary !py-2 text-xs shrink-0">
                {showForm ? 'Cancel' : '+ Log payment'}
              </button>
            )}
          </div>

          {/* ---------- BILLING TAB ---------- */}
          {tab === 'billing' && canEdit && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="lx-card p-5">
                  <div className="lx-eyebrow mb-1">Pending</div>
                  <div className="text-2xl font-sans font-bold text-ink">{summary ? summary.pending_count : '—'}</div>
                  <div className="text-xs text-stone mt-0.5">{summary ? money(summary.pending_total) : ''}</div>
                </div>
                <div className="lx-card p-5">
                  <div className="lx-eyebrow mb-1">Late</div>
                  <div className="text-2xl font-sans font-bold" style={{ color: 'var(--tone-danger)' }}>{summary ? summary.late_count : '—'}</div>
                  <div className="text-xs text-stone mt-0.5">{summary ? money(summary.late_total) : ''}</div>
                </div>
              </div>
              <div className="lx-card p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={handleGenerate} disabled={billingBusy} className="lx-btn-ghost !py-2 text-xs">
                    {billingBusy ? 'Working…' : 'Generate this period’s charges'}
                  </button>
                  <button onClick={handleFlagLate} disabled={billingBusy} className="lx-btn-ghost !py-2 text-xs">Flag late payments</button>
                </div>
                {billingMsg && <p className="text-xs text-stone">{billingMsg}</p>}
                <p className="text-[11px] text-stone-light">
                  Generates a pending payment for every active long-stay lease not yet billed this month/year. Short-stay
                  (nightly) bookings are paid at time of stay and aren&apos;t auto-billed.
                </p>
              </div>
            </div>
          )}

          {/* ---------- PAYMENTS TAB ---------- */}
          {tab === 'payments' && (
            <>
              <div className="mb-4"><SearchInput value={search} onChange={setSearch} placeholder="Search reference, method, notes…" /></div>

              {canEdit && showForm && (
                <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Lease" required className="sm:col-span-3">
                    <select required className="lx-select" value={form.lease_id} onChange={(e) => setForm({ ...form, lease_id: e.target.value })}>
                      <option value="">Select lease…</option>
                      {leases.map((l) => <option key={l.id} value={l.id}>{l.stay_type} · {l.start_date} → {l.end_date || 'ongoing'} · {money(l.agreed_rate)}/{l.rate_period}</option>)}
                    </select>
                  </Field>
                  <TextField label="Amount" required type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  <Field label="Currency">
                    <select className="lx-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      <option value="">{currency} (account default)</option>
                      {Object.keys(CURRENCY_LABELS).filter((c) => c !== currency).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="lx-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Method">
                    <select className="lx-select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                      {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Due date"><input type="date" className="lx-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
                  <Field label="Payment date"><input type="date" className="lx-input" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} /></Field>
                  <button disabled={saving} className="lx-btn-gold sm:col-span-3 justify-self-start w-full sm:w-auto">{saving ? 'Saving…' : 'Log Payment'}</button>
                </form>
              )}

              {/* Mobile cards */}
              <div className="sm:hidden space-y-3">
                {shownPayments.map((p) => (
                  <div key={p.id} className="lx-card p-4">
                    {editingId === p.id ? (
                      <div className="space-y-2">
                        <input type="date" className="lx-input" value={edit.payment_date || ''} onChange={(e) => setEdit({ ...edit, payment_date: e.target.value })} />
                        <input type="number" className="lx-input" placeholder="Amount" value={edit.amount ?? ''} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
                        <select className="lx-select" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <select className="lx-select" value={edit.method || ''} onChange={(e) => setEdit({ ...edit, method: e.target.value })}>
                          <option value="">No method</option>
                          {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <div className="flex items-center gap-2 pt-1">
                          <button onClick={() => saveEdit(p.id)} disabled={busyId === p.id} className="lx-btn-primary text-sm flex-1">{busyId === p.id ? 'Saving…' : 'Save'}</button>
                          <RowActions editing busy={busyId === p.id} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} deleteLabel="Delete this payment?" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div><div className="font-semibold text-ink">{money(p.amount, p.currency)}</div>
                            <div className="text-xs text-stone">{p.payment_date || p.due_date}</div></div>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-line/70">
                          <span className="text-xs text-stone capitalize">{methodLabel(p.method)}</span>
                          {canEdit && <RowActions editing={false} busy={busyId === p.id} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} deleteLabel="Delete this payment?" />}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {shownPayments.length === 0 && <div className="lx-card p-8 text-center text-stone text-sm">{payments.length === 0 ? 'No payments yet.' : 'Nothing matches those filters.'}</div>}
              </div>

              {/* Desktop table */}
              <div className="lx-card overflow-hidden hidden sm:block">
                <div className="overflow-x-auto">
                  <table className="w-full lx-table min-w-[500px]">
                    <thead><tr>
                      <th>Date</th><th className="text-right">Amount</th><th>Status</th><th>Method</th>{canEdit && <th className="text-right">Actions</th>}
                    </tr></thead>
                    <tbody>
                      {shownPayments.map((p) => (
                        <tr key={p.id}>
                          <td>{editingId === p.id ? <input type="date" className="lx-input !py-1 text-xs" value={edit.payment_date || ''} onChange={(e) => setEdit({ ...edit, payment_date: e.target.value })} /> : (p.payment_date || p.due_date)}</td>
                          <td className="text-right">{editingId === p.id ? <input type="number" className="lx-input !py-1 text-xs w-28 text-right" value={edit.amount ?? ''} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /> : money(p.amount, p.currency)}</td>
                          <td>{editingId === p.id ? (
                            <select className="lx-select !py-1 text-xs" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>) : <StatusBadge status={p.status} />}</td>
                          <td className="capitalize">{editingId === p.id ? (
                            <select className="lx-select !py-1 text-xs" value={edit.method || ''} onChange={(e) => setEdit({ ...edit, method: e.target.value })}>
                              <option value="">—</option>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>) : methodLabel(p.method)}</td>
                          {canEdit && (
                            <td><div className="flex items-center justify-end gap-2">
                              {editingId === p.id && <button onClick={() => saveEdit(p.id)} disabled={busyId === p.id} className="text-xs px-2.5 py-1 rounded-lg bg-ink text-white">{busyId === p.id ? 'Saving…' : 'Save'}</button>}
                              <RowActions editing={editingId === p.id} busy={busyId === p.id} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} deleteLabel="Delete this payment?" />
                            </div></td>
                          )}
                        </tr>
                      ))}
                      {shownPayments.length === 0 && <tr><td colSpan={canEdit ? 5 : 4} className="px-5 py-10 text-center text-stone">{payments.length === 0 ? 'No payments yet.' : 'Nothing matches those filters.'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
