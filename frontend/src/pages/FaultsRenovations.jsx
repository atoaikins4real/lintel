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
import AccordionRow from '../components/AccordionRow.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

// Preset classification lists — dropdowns so users pick instead of typing.
const FAULT_TYPES = [
  'Plumbing', 'Electrical', 'Appliance', 'HVAC / AC', 'Structural', 'Roof / ceiling',
  'Pest control', 'Security / locks', 'Doors / windows', 'Painting / cosmetic', 'Internet / cable', 'Other',
];
const RENO_TYPES = [
  'Kitchen', 'Bathroom', 'Flooring', 'Painting', 'Roofing', 'Windows & doors',
  'Electrical upgrade', 'Plumbing upgrade', 'Exterior / landscaping', 'Full refurbishment', 'Furnishing', 'Other',
];
const SEVERITIES = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']];
const CAUSES = [['unknown', 'Unknown'], ['tenant', 'Tenant'], ['wear_and_tear', 'Wear & tear'], ['external', 'External']];
const FAULT_STATUSES = [['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved (fixed)']];

const SEV_TONE = { low: 'bg-stone/10 text-stone', medium: 'pill-warn', high: 'pill-danger', critical: 'pill-danger' };

const emptyFault = {
  unit_id: '', description: '', fault_type: '', severity: 'low', caused_by: 'unknown', reported_date: '', cost: '',
  tenant_id: '', reporter_name: '', reporter_contact: '',
};
const emptyReno = { unit_id: '', description: '', reno_type: '', cost: '', start_date: '', end_date: '', rate_before: '', rate_after: '' };
const emptyExpense = { unit_id: '', category_id: '', amount: '', expense_date: '', description: '', receipt_url: '' };

const today = () => new Date().toISOString().slice(0, 10);

// Small neutral tag used in the collapsed summaries.
const Tag = ({ children }) => <span className="pill bg-stone/10 text-stone">{children}</span>;

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

  // One open accordion row per section.
  const [openFault, setOpenFault] = useState(null);
  const [openReno, setOpenReno] = useState(null);
  const [openExpense, setOpenExpense] = useState(null);

  // Filter dropdowns per section.
  const [fFilter, setFFilter] = useState({ status: '', type: '', unit: '' });
  const [rFilter, setRFilter] = useState({ type: '', unit: '' });
  const [xFilter, setXFilter] = useState({ category: '', unit: '' });

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
  const reporterOf = (f) => {
    if (f.tenant_id) return { label: tenantName(f.tenant_id) || 'Tenant', contact: null };
    if (f.reporter_name) return { label: f.reporter_name, contact: f.reporter_contact || null };
    return null;
  };

  // "Reported by" picker maps one <select> to the two stored shapes.
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

  // Filtered views.
  const shownFaults = faults.filter((f) =>
    (!fFilter.status || f.status === fFilter.status) &&
    (!fFilter.type || f.fault_type === fFilter.type) &&
    (!fFilter.unit || f.unit_id === fFilter.unit));
  const shownRenos = renovations.filter((r) =>
    (!rFilter.type || r.reno_type === rFilter.type) &&
    (!rFilter.unit || r.unit_id === rFilter.unit));
  const shownExpenses = expenses.filter((x) =>
    (!xFilter.category || x.category_id === xFilter.category) &&
    (!xFilter.unit || x.unit_id === xFilter.unit));

  const submitExpense = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingExpenseId) await updateExpense(editingExpenseId, expenseForm);
      else await createExpense(expenseForm);
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
      unit_id: x.unit_id || '', category_id: x.category_id || '', amount: x.amount ?? '',
      expense_date: x.expense_date || '', description: x.description || '', receipt_url: x.receipt_url || '',
    });
  };

  const cancelExpense = () => {
    setShowExpenseForm(false);
    setEditingExpenseId(null);
    setExpenseForm(emptyExpense);
  };

  const removeExpense = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteExpense(id); getExpenses().then(setExpenses); }
    catch (err) { setError(readApiError(err, 'delete that expense')); }
    finally { setBusyId(null); }
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

  const setFaultStatus = async (id, status) => {
    setError(''); setBusyId(id);
    try {
      const resolved_date = status === 'resolved' ? today() : '';
      await updateFault(id, { status, resolved_date });
      getFaults().then(setFaults);
    } catch (err) { setError(readApiError(err, 'update that fault')); }
    finally { setBusyId(null); }
  };

  const removeFault = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteFault(id); getFaults().then(setFaults); }
    catch (err) { setError(readApiError(err, 'delete that fault')); }
    finally { setBusyId(null); }
  };

  const removeReno = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteRenovation(id); getRenovations().then(setRenovations); }
    catch (err) { setError(readApiError(err, 'delete that renovation')); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}
      <p className="text-stone text-sm mb-6">What broke, who reported it, what it cost, and what it did to the unit&apos;s rate.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* ---------------- FAULTS ---------------- */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-serif text-xl text-ink">Faults</div>
            {canEdit && (
              <button onClick={() => setShowFaultForm((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs">
                {showFaultForm ? 'Cancel' : '+ Log Fault'}
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-3">
            <select className="lx-filter" value={fFilter.status} onChange={(e) => setFFilter({ ...fFilter, status: e.target.value })}>
              <option value="">All statuses</option>
              {FAULT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select className="lx-filter" value={fFilter.type} onChange={(e) => setFFilter({ ...fFilter, type: e.target.value })}>
              <option value="">All types</option>
              {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="lx-filter" value={fFilter.unit} onChange={(e) => setFFilter({ ...fFilter, unit: e.target.value })}>
              <option value="">All apartments</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
            </select>
          </div>

          {canEdit && showFaultForm && (
            <form onSubmit={submitFault} className="lx-card p-5 mb-4 space-y-3">
              <Field label="Apartment" required>
                <select required className="lx-select" value={faultForm.unit_id}
                  onChange={(e) => setFaultForm({ ...faultForm, unit_id: e.target.value })}>
                  <option value="">Select apartment…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className="lx-select" value={faultForm.fault_type}
                  onChange={(e) => setFaultForm({ ...faultForm, fault_type: e.target.value })}>
                  <option value="">Select type…</option>
                  {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <TextField label="Description" required hint="What exactly is wrong"
                value={faultForm.description} onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Severity">
                  <select className="lx-select" value={faultForm.severity}
                    onChange={(e) => setFaultForm({ ...faultForm, severity: e.target.value })}>
                    {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Caused by">
                  <select className="lx-select" value={faultForm.caused_by}
                    onChange={(e) => setFaultForm({ ...faultForm, caused_by: e.target.value })}>
                    {CAUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Reported by" hint="Who flagged this — a tenant on file, or anyone else.">
                <select className="lx-select" value={reporterSelectValue} onChange={(e) => onReporterSelect(e.target.value)}>
                  <option value="">Not specified</option>
                  {tenants.length > 0 && (
                    <optgroup label="Tenants">
                      {tenants.map((t) => <option key={t.id} value={`tenant:${t.id}`}>{t.first_name} {t.last_name}</option>)}
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

          <div className="space-y-2.5">
            {shownFaults.map((f) => (
              <AccordionRow
                key={f.id}
                open={openFault === f.id}
                onToggle={() => setOpenFault(openFault === f.id ? null : f.id)}
                title={unitLabel(f.unit_id)}
                badges={<>
                  {f.fault_type && <Tag>{f.fault_type}</Tag>}
                  <StatusBadge status={f.status} />
                </>}
                meta={f.cost ? money(f.cost) : null}
              >
                <div className="text-sm text-ink/90">{f.description}</div>
                {reporterOf(f) && (
                  <div className="text-xs flex items-center gap-1.5 flex-wrap">
                    <span className="pill bg-stone/10 text-stone">Reported by</span>
                    <span className="text-ink/90 font-medium">{reporterOf(f).label}</span>
                    {reporterOf(f).contact && <span className="text-stone">· {reporterOf(f).contact}</span>}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap text-xs text-stone">
                  <span className={`pill capitalize ${SEV_TONE[f.severity] || 'bg-stone/10 text-stone'}`}>{f.severity}</span>
                  <span>Reported {f.reported_date || '—'}</span>
                  <span>· caused by {String(f.caused_by).replace(/_/g, ' ')}</span>
                  {f.status === 'resolved' && f.resolved_date && <span>· fixed {f.resolved_date}</span>}
                </div>
                {canEdit && (
                  <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-line/70">
                    <label className="flex items-center gap-2 text-xs text-stone">
                      Status
                      <select className="lx-select !py-1 text-xs w-auto" value={f.status} disabled={busyId === f.id}
                        onChange={(e) => setFaultStatus(f.id, e.target.value)}>
                        {FAULT_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                    <RowActions onDelete={() => removeFault(f.id)} busy={busyId === f.id} deleteLabel="Delete this fault?" />
                  </div>
                )}
              </AccordionRow>
            ))}
            {shownFaults.length === 0 && (
              <p className="text-stone text-sm">{faults.length === 0 ? 'No faults logged.' : 'Nothing matches those filters.'}</p>
            )}
          </div>
        </div>

        {/* ---------------- RENOVATIONS ---------------- */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-serif text-xl text-ink">Renovations</div>
            {canEdit && (
              <button onClick={() => setShowRenoForm((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs">
                {showRenoForm ? 'Cancel' : '+ Log Renovation'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <select className="lx-filter" value={rFilter.type} onChange={(e) => setRFilter({ ...rFilter, type: e.target.value })}>
              <option value="">All types</option>
              {RENO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="lx-filter" value={rFilter.unit} onChange={(e) => setRFilter({ ...rFilter, unit: e.target.value })}>
              <option value="">All apartments</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
            </select>
          </div>

          {canEdit && showRenoForm && (
            <form onSubmit={submitReno} className="lx-card p-5 mb-4 space-y-3">
              <Field label="Apartment" required>
                <select required className="lx-select" value={renoForm.unit_id}
                  onChange={(e) => setRenoForm({ ...renoForm, unit_id: e.target.value })}>
                  <option value="">Select apartment…</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select className="lx-select" value={renoForm.reno_type}
                  onChange={(e) => setRenoForm({ ...renoForm, reno_type: e.target.value })}>
                  <option value="">Select type…</option>
                  {RENO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <TextField label="Description" required hint="e.g. new cabinets & worktop"
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

          <div className="space-y-2.5">
            {shownRenos.map((r) => (
              <AccordionRow
                key={r.id}
                open={openReno === r.id}
                onToggle={() => setOpenReno(openReno === r.id ? null : r.id)}
                title={unitLabel(r.unit_id)}
                badges={r.reno_type ? <Tag>{r.reno_type}</Tag> : null}
                meta={money(r.cost)}
              >
                <div className="text-sm text-ink/90">{r.description}</div>
                <div className="text-xs text-stone flex flex-wrap gap-x-3 gap-y-1">
                  <span>Cost {money(r.cost)}</span>
                  {r.rate_before && r.rate_after && <span>Rate {money(r.rate_before)} → {money(r.rate_after)}</span>}
                  {(r.start_date || r.end_date) && <span>{r.start_date || '—'} → {r.end_date || 'ongoing'}</span>}
                </div>
                {canEdit && (
                  <div className="flex justify-end pt-2 mt-1 border-t border-line/70">
                    <RowActions onDelete={() => removeReno(r.id)} busy={busyId === r.id} deleteLabel="Delete this renovation?" />
                  </div>
                )}
              </AccordionRow>
            ))}
            {shownRenos.length === 0 && (
              <p className="text-stone text-sm">{renovations.length === 0 ? 'No renovations logged.' : 'Nothing matches those filters.'}</p>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- OPERATING EXPENSES ---------------- */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-serif text-xl text-ink">Operating expenses</div>
            <p className="text-stone text-xs mt-0.5">
              Utilities, management fees, insurance, tax and cleaning — each with its receipt. These feed your
              P&amp;L and the expense breakdown in Reports.
            </p>
          </div>
          {canEdit && (
            <button onClick={() => (showExpenseForm ? cancelExpense() : setShowExpenseForm(true))}
              className="lx-btn-ghost !px-3 !py-1.5 text-xs shrink-0">
              {showExpenseForm ? 'Cancel' : '+ Record Expense'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <select className="lx-filter" value={xFilter.category} onChange={(e) => setXFilter({ ...xFilter, category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="lx-filter" value={xFilter.unit} onChange={(e) => setXFilter({ ...xFilter, unit: e.target.value })}>
            <option value="">All apartments</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
          </select>
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
              value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
            <Field label="Date" required>
              <input type="date" required className="lx-input"
                value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} />
            </Field>
            <TextField label="Description" className="sm:col-span-2" hint="Optional"
              value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />

            <div className="sm:col-span-2">
              <span className="lx-label">Receipt <span className="text-stone font-normal">— a photo of the receipt (optional)</span></span>
              {expenseForm.receipt_url ? (
                <div className="flex items-center gap-3">
                  <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={expenseForm.receipt_url} alt="Receipt" className="w-16 h-16 rounded-lg object-cover border border-line" />
                  </a>
                  <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-gold hover:underline">View full size</a>
                  <button type="button" onClick={() => setExpenseForm({ ...expenseForm, receipt_url: '' })}
                    className="text-xs text-stone hover:text-rose-600">Remove</button>
                </div>
              ) : (
                <PhotoUploader label="Upload receipt"
                  onUploaded={(urls) => setExpenseForm((f) => ({ ...f, receipt_url: urls[0] }))} />
              )}
            </div>

            <div className="sm:col-span-2 flex gap-3">
              <button className="lx-btn-gold">{editingExpenseId ? 'Save changes' : 'Record Expense'}</button>
              <button type="button" onClick={cancelExpense} className="lx-btn-ghost">Cancel</button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          {shownExpenses.map((x) => (
            <AccordionRow
              key={x.id}
              open={openExpense === x.id}
              onToggle={() => setOpenExpense(openExpense === x.id ? null : x.id)}
              title={unitLabel(x.unit_id)}
              badges={<>
                <Tag>{x.category_name || x.category || 'Uncategorised'}</Tag>
                {x.receipt_url && <span className="pill pill-ok">Receipt</span>}
              </>}
              meta={money(x.amount)}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 space-y-1">
                  {x.description && <div className="text-sm text-ink/90">{x.description}</div>}
                  <div className="text-stone text-xs">{money(x.amount)}{x.expense_date ? ` · ${x.expense_date}` : ''}</div>
                </div>
                {x.receipt_url ? (
                  <a href={x.receipt_url} target="_blank" rel="noreferrer" title="View receipt" className="shrink-0 group">
                    <img src={x.receipt_url} alt="Receipt"
                      className="w-16 h-16 rounded-lg object-cover border border-line group-hover:border-gold transition" />
                    <span className="block text-[10px] text-stone text-center mt-1 group-hover:text-gold">View</span>
                  </a>
                ) : (
                  <span className="shrink-0 text-[11px] text-stone-light border border-dashed border-line rounded-lg px-2 py-1.5">
                    No receipt
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="flex justify-end pt-2 mt-1 border-t border-line/70">
                  <RowActions onEdit={() => startEditExpense(x)} editing={editingExpenseId === x.id}
                    onDelete={() => removeExpense(x.id)} busy={busyId === x.id} deleteLabel="Delete this expense?" />
                </div>
              )}
            </AccordionRow>
          ))}
          {shownExpenses.length === 0 && (
            <p className="text-stone text-sm">
              {expenses.length === 0
                ? 'No expenses recorded yet — your P&L will show zero costs until you add some.'
                : 'Nothing matches those filters.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
