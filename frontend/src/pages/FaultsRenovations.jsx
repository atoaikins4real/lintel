import { useEffect, useState } from 'react';
import {
  getFaults, createFault, updateFault, deleteFault,
  getRenovations, createRenovation, deleteRenovation,
  getExpenses, createExpense, updateExpense, deleteExpense, getExpenseCategories,
  getUnits, getTenants, readApiError,
} from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import RowActions from '../components/RowActions.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const emptyFault = {
  unit_id: '', description: '', severity: 'low', caused_by: 'unknown', reported_date: '', cost: '',
  tenant_id: '', reporter_name: '', reporter_contact: '',
};
const emptyReno = { unit_id: '', description: '', cost: '', start_date: '', end_date: '', rate_before: '', rate_after: '' };
const emptyExpense = { unit_id: '', category_id: '', amount: '', expense_date: '', description: '', receipt_url: '' };

const today = () => new Date().toISOString().slice(0, 10);

// Categories are per-company and fetched at runtime — see Settings.

export default function FaultsRenovations() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [faults, setFaults] = useState([]);
  const [renovations, setRenovations] = useState([]);
  const [faultForm, setFaultForm] = useState(emptyFault);
  const [renoForm, setRenoForm] = useState(emptyReno);
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [showRenoForm, setShowRenoForm] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Operating costs — utilities, management fees, insurance, tax,
  // cleaning. These feed the P&L and the expense-breakdown chart, but
  // until now there was no way to record one: createExpense existed in
  // the API client and was called from nowhere, so every subscriber's
  // cost figures would have stayed at zero for ever.
  const [expenses, setExpenses] = useState([]);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    getUnits().then(setUnits);
    getTenants().then(setTenants).catch(() => setTenants([]));
    getFaults().then(setFaults);
    getRenovations().then(setRenovations);
    getExpenses().then(setExpenses).catch(() => setExpenses([]));
    getExpenseCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const unitLabel = (id) => units.find((u) => u.id === id)?.unit_code || id;
  const tenantName = (id) => {
    const t = tenants.find((x) => x.id === id);
    return t ? `${t.first_name} ${t.last_name}`.trim() : null;
  };
  // Who reported a fault: a linked tenant, or a free-text person, else null.
  const reporterOf = (f) => {
    if (f.tenant_id) return { label: tenantName(f.tenant_id) || 'Tenant', kind: 'Tenant', contact: null };
    if (f.reporter_name) return { label: f.reporter_name, kind: 'Reporter', contact: f.reporter_contact || null };
    return null;
  };

  // The "Reported by" picker maps one <select> to the two stored shapes:
  // a tenant link (tenant_id) or a free-text person (reporter_name/contact).
  const reporterSelectValue = faultForm.tenant_id
    ? `tenant:${faultForm.tenant_id}`
    : faultForm.reporter_name || faultForm._other
    ? 'other'
    : '';
  const onReporterSelect = (v) => {
    if (v === '') setFaultForm({ ...faultForm, tenant_id: '', reporter_name: '', reporter_contact: '', _other: false });
    else if (v === 'other') setFaultForm({ ...faultForm, tenant_id: '', _other: true });
    else setFaultForm({ ...faultForm, tenant_id: v.replace('tenant:', ''), reporter_name: '', reporter_contact: '', _other: false });
  };

  const submitExpense = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingExpenseId) {
        await updateExpense(editingExpenseId, expenseForm);
      } else {
        await createExpense(expenseForm);
      }
      setExpenseForm(emptyExpense);
      setShowExpenseForm(false);
      setEditingExpenseId(null);
      getExpenses().then(setExpenses);
    } catch (err) {
      setError(readApiError(err, editingExpenseId ? 'update that expense' : 'record that expense'));
    }
  };

  const startEditExpense = (x) => {
    setEditingExpenseId(x.id);
    setShowExpenseForm(true);
    setExpenseForm({
      unit_id: x.unit_id || '',
      category_id: x.category_id || '',
      amount: x.amount ?? '',
      expense_date: x.expense_date || '',
      description: x.description || '',
      receipt_url: x.receipt_url || '',
    });
  };

  const cancelExpense = () => {
    setShowExpenseForm(false);
    setEditingExpenseId(null);
    setExpenseForm(emptyExpense);
  };

  const removeExpense = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteExpense(id);
      getExpenses().then(setExpenses);
    } catch (err) {
      setError(readApiError(err, 'delete that expense'));
    } finally {
      setBusyId(null);
    }
  };

  const submitFault = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { _other, ...payload } = faultForm; // _other is UI-only
      await createFault(payload);
      setFaultForm(emptyFault);
      setShowFaultForm(false);
      getFaults().then(setFaults);
    } catch (err) {
      setError(readApiError(err, 'log that fault'));
    }
  };

  const submitReno = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createRenovation(renoForm);
      setRenoForm(emptyReno);
      setShowRenoForm(false);
      getRenovations().then(setRenovations);
    } catch (err) {
      setError(readApiError(err, 'log that renovation'));
    }
  };

  // Marking a fault resolved is the whole point of tracking them — this
  // was previously impossible from the UI, so faults only ever piled up.
  const setFaultStatus = async (id, status) => {
    setError('');
    setBusyId(id);
    try {
      // Stamp the fix date when it's marked resolved, clear it if reopened,
      // so "fixed on <date>" is always accurate.
      const resolved_date = status === 'resolved' ? today() : '';
      await updateFault(id, { status, resolved_date });
      getFaults().then(setFaults);
    } catch (err) {
      setError(readApiError(err, 'update that fault'));
    } finally {
      setBusyId(null);
    }
  };

  const removeFault = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteFault(id);
      getFaults().then(setFaults);
    } catch (err) {
      setError(readApiError(err, 'delete that fault'));
    } finally {
      setBusyId(null);
    }
  };

  const removeReno = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteRenovation(id);
      getRenovations().then(setRenovations);
    } catch (err) {
      setError(readApiError(err, 'delete that renovation'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}
      <p className="text-stone text-sm mb-6">What broke, what it cost, and what it did to the unit&apos;s rate.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-serif text-xl text-ink">Faults</div>
            {canEdit && (
              <button onClick={() => setShowFaultForm((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs">
                {showFaultForm ? 'Cancel' : '+ Log Fault'}
              </button>
            )}
          </div>
          {canEdit && showFaultForm && (
            <form onSubmit={submitFault} className="lx-card p-5 mb-4 space-y-3">
              <Field label="Unit" required>
                <select required className="lx-select" value={faultForm.unit_id}
                  onChange={(e) => setFaultForm({ ...faultForm, unit_id: e.target.value })}>
                  <option value="">Select unit…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                </select>
              </Field>
              <TextField label="Description" required
                value={faultForm.description} onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Severity">
                  <select className="lx-select" value={faultForm.severity}
                    onChange={(e) => setFaultForm({ ...faultForm, severity: e.target.value })}>
                    <option value="low">Low</option><option value="medium">Medium</option>
                    <option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Caused by">
                  <select className="lx-select" value={faultForm.caused_by}
                    onChange={(e) => setFaultForm({ ...faultForm, caused_by: e.target.value })}>
                    <option value="unknown">Unknown</option><option value="tenant">Tenant</option>
                    <option value="wear_and_tear">Wear & tear</option><option value="external">External</option>
                  </select>
                </Field>
              </div>
              <Field label="Reported by" hint="Who flagged this — a tenant on file, or anyone else.">
                <select className="lx-select" value={reporterSelectValue} onChange={(e) => onReporterSelect(e.target.value)}>
                  <option value="">Not specified</option>
                  {tenants.length > 0 && (
                    <optgroup label="Tenants">
                      {tenants.map((t) => (
                        <option key={t.id} value={`tenant:${t.id}`}>{t.first_name} {t.last_name}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="other">Someone else…</option>
                </select>
              </Field>
              {reporterSelectValue === 'other' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField label="Reporter name" required placeholder="e.g. Security, neighbour, caretaker"
                    value={faultForm.reporter_name}
                    onChange={(e) => setFaultForm({ ...faultForm, reporter_name: e.target.value })} />
                  <TextField label="Contact" hint="Phone or email (optional)"
                    value={faultForm.reporter_contact}
                    onChange={(e) => setFaultForm({ ...faultForm, reporter_contact: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Reported date">
                  <input type="date" className="lx-input"
                    value={faultForm.reported_date} onChange={(e) => setFaultForm({ ...faultForm, reported_date: e.target.value })} />
                </Field>
                <TextField label="Repair cost" type="number"
                  value={faultForm.cost} onChange={(e) => setFaultForm({ ...faultForm, cost: e.target.value })} />
              </div>
              <button className="lx-btn-gold w-full sm:w-auto">Log Fault</button>
            </form>
          )}
          <ul className="space-y-2.5">
            {faults.map((f) => (
              <li key={f.id} className="lx-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink text-sm">{unitLabel(f.unit_id)}</span>
                  <StatusBadge status={f.status} />
                </div>
                <div className="text-sm text-ink/80">{f.description}</div>
                {reporterOf(f) && (
                  <div className="text-xs mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="pill bg-stone/10 text-stone">Reported by</span>
                    <span className="text-ink/80 font-medium">{reporterOf(f).label}</span>
                    {reporterOf(f).contact && <span className="text-stone">· {reporterOf(f).contact}</span>}
                  </div>
                )}
                <div className="text-stone text-xs mt-1">
                  {f.reported_date} · {f.severity} · caused by {f.caused_by.replace('_', ' ')}{f.cost ? ` · ${money(f.cost)}` : ''}
                  {f.status === 'resolved' && f.resolved_date ? ` · fixed ${f.resolved_date}` : ''}
                </div>
                {canEdit && (
                  <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-line/70">
                    <label className="flex items-center gap-2 text-xs text-stone">
                      Status
                      <select
                        className="lx-select !py-1 text-xs w-auto"
                        value={f.status}
                        disabled={busyId === f.id}
                        onChange={(e) => setFaultStatus(f.id, e.target.value)}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="resolved">Resolved (fixed)</option>
                      </select>
                    </label>
                    <RowActions onDelete={() => removeFault(f.id)} busy={busyId === f.id} deleteLabel="Delete this fault?" />
                  </div>
                )}
              </li>
            ))}
            {faults.length === 0 && <p className="text-stone text-sm">No faults logged.</p>}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-serif text-xl text-ink">Renovations</div>
            {canEdit && (
              <button onClick={() => setShowRenoForm((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs">
                {showRenoForm ? 'Cancel' : '+ Log Renovation'}
              </button>
            )}
          </div>
          {canEdit && showRenoForm && (
            <form onSubmit={submitReno} className="lx-card p-5 mb-4 space-y-3">
              <Field label="Unit" required>
                <select required className="lx-select" value={renoForm.unit_id}
                  onChange={(e) => setRenoForm({ ...renoForm, unit_id: e.target.value })}>
                  <option value="">Select unit…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                </select>
              </Field>
              <TextField label="Description" required hint="e.g. kitchen upgrade"
                value={renoForm.description} onChange={(e) => setRenoForm({ ...renoForm, description: e.target.value })} />
              <TextField label="Cost" required type="number"
                value={renoForm.cost} onChange={(e) => setRenoForm({ ...renoForm, cost: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start date">
                  <input type="date" className="lx-input"
                    value={renoForm.start_date} onChange={(e) => setRenoForm({ ...renoForm, start_date: e.target.value })} />
                </Field>
                <Field label="End date">
                  <input type="date" className="lx-input"
                    value={renoForm.end_date} onChange={(e) => setRenoForm({ ...renoForm, end_date: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Rate before" type="number"
                  value={renoForm.rate_before} onChange={(e) => setRenoForm({ ...renoForm, rate_before: e.target.value })} />
                <TextField label="Rate after" type="number"
                  value={renoForm.rate_after} onChange={(e) => setRenoForm({ ...renoForm, rate_after: e.target.value })} />
              </div>
              <button className="lx-btn-gold w-full sm:w-auto">Log Renovation</button>
            </form>
          )}
          <ul className="space-y-2.5">
            {renovations.map((r) => (
              <li key={r.id} className="lx-card p-4">
                <div className="font-medium text-ink text-sm mb-1">{unitLabel(r.unit_id)}</div>
                <div className="text-sm text-ink/80">{r.description}</div>
                <div className="text-stone text-xs mt-1">
                  {money(r.cost)}{r.rate_before && r.rate_after ? ` · ${money(r.rate_before)} → ${money(r.rate_after)}` : ''}
                </div>
                {canEdit && (
                  <div className="flex justify-end mt-2.5 pt-2.5 border-t border-line/70">
                    <RowActions onDelete={() => removeReno(r.id)} busy={busyId === r.id} deleteLabel="Delete this renovation?" />
                  </div>
                )}
              </li>
            ))}
            {renovations.length === 0 && <p className="text-stone text-sm">No renovations logged.</p>}
          </ul>
        </div>
      </div>

      {/* Operating costs. Separate from faults and renovations because
          these are recurring running costs rather than one-off repairs,
          but they land in the same P&L. */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-serif text-xl text-ink">Operating expenses</div>
            <p className="text-stone text-xs mt-0.5">
              Utilities, management fees, insurance, tax and cleaning. These feed your P&amp;L and the
              expense breakdown in Reports.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => (showExpenseForm ? cancelExpense() : setShowExpenseForm(true))}
              className="lx-btn-ghost !px-3 !py-1.5 text-xs shrink-0"
            >
              {showExpenseForm ? 'Cancel' : '+ Record Expense'}
            </button>
          )}
        </div>

        {canEdit && showExpenseForm && (
          <form onSubmit={submitExpense} className="lx-card p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Apartment" required>
              <select required className="lx-select" value={expenseForm.unit_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, unit_id: e.target.value })}>
                <option value="">Select apartment…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
              </select>
            </Field>
            <Field label="Category" required>
              <select required className="lx-select" value={expenseForm.category_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}>
                <option value="">Select category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <TextField label="Amount" required type="number" min="0" step="any"
              value={expenseForm.amount}
              onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            <Field label="Date" required>
              <input type="date" required className="lx-input"
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
            </Field>
            <TextField label="Description" className="sm:col-span-2" hint="Optional"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />

            <div className="sm:col-span-2">
              <span className="lx-label">Receipt <span className="text-stone font-normal">— a photo of the receipt (optional)</span></span>
              {expenseForm.receipt_url ? (
                <div className="flex items-center gap-3">
                  <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={expenseForm.receipt_url} alt="Receipt"
                      className="w-16 h-16 rounded-lg object-cover border border-line" />
                  </a>
                  <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-gold hover:underline">
                    View full size
                  </a>
                  <button type="button" onClick={() => setExpenseForm({ ...expenseForm, receipt_url: '' })}
                    className="text-xs text-stone hover:text-rose-600">Remove</button>
                </div>
              ) : (
                <PhotoUploader label="Upload receipt"
                  onUploaded={(urls) => setExpenseForm((f) => ({ ...f, receipt_url: urls[0] }))} />
              )}
            </div>

            <div className="sm:col-span-2 flex gap-3">
              <button className="lx-btn-gold">
                {editingExpenseId ? 'Save changes' : 'Record Expense'}
              </button>
              <button type="button" onClick={cancelExpense} className="lx-btn-ghost">Cancel</button>
            </div>
          </form>
        )}

        <ul className="space-y-2.5">
          {expenses.map((x) => (
            <li key={x.id} className="lx-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-ink text-sm mb-0.5">
                    {unitLabel(x.unit_id)}
                    <span className="pill bg-stone/10 text-stone ml-2">{x.category_name || x.category || 'Uncategorised'}</span>
                  </div>
                  {x.description && <div className="text-sm text-ink/80">{x.description}</div>}
                  <div className="text-stone text-xs mt-1">
                    {money(x.amount)}{x.expense_date ? ` · ${x.expense_date}` : ''}
                  </div>
                </div>
                {x.receipt_url ? (
                  <a href={x.receipt_url} target="_blank" rel="noreferrer"
                    title="View receipt" className="shrink-0 group">
                    <img src={x.receipt_url} alt="Receipt"
                      className="w-14 h-14 rounded-lg object-cover border border-line group-hover:border-gold transition" />
                    <span className="block text-[10px] text-stone text-center mt-1 group-hover:text-gold">Receipt</span>
                  </a>
                ) : (
                  <span className="shrink-0 text-[11px] text-stone-light border border-dashed border-line rounded-lg px-2 py-1.5">
                    No receipt
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="flex justify-end mt-2.5 pt-2.5 border-t border-line/70">
                  <RowActions
                    onEdit={() => startEditExpense(x)}
                    editing={editingExpenseId === x.id}
                    onDelete={() => removeExpense(x.id)}
                    busy={busyId === x.id}
                    deleteLabel="Delete this expense?"
                  />
                </div>
              )}
            </li>
          ))}
          {expenses.length === 0 && (
            <p className="text-stone text-sm">
              No expenses recorded yet — your P&amp;L will show zero costs until you add some.
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
