import { useEffect, useState } from 'react';
import {
  getFaults, createFault, updateFault, deleteFault,
  getRenovations, createRenovation, deleteRenovation,
  getExpenses, createExpense, updateExpense, deleteExpense, getExpenseCategories,
  getUnits, getTenants, readApiError,
} from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import StatCard from '../components/StatCard.jsx';
import RowActions from '../components/RowActions.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import AccordionRow from '../components/AccordionRow.jsx';
import SidePanel from '../components/SidePanel.jsx';
import Tabs from '../components/Tabs.jsx';
import Field, { TextField } from '../components/Field.jsx';
import { IconWrench, IconHome, IconChart } from '../components/icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

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
const FAULT_STATUSES = [['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Fixed']];
const SEV_TONE = { low: 'bg-stone/10 text-stone', medium: 'pill-warn', high: 'pill-danger', critical: 'pill-danger' };

const emptyFault = {
  unit_id: '', description: '', fault_type: '', severity: 'low', caused_by: 'unknown', reported_date: '', cost: '',
  tenant_id: '', reporter_name: '', reporter_contact: '',
};
const emptyReno = { unit_id: '', description: '', reno_type: '', cost: '', start_date: '', end_date: '', rate_before: '', rate_after: '' };
const emptyExpense = { unit_id: '', category_id: '', amount: '', expense_date: '', description: '', receipt_url: '' };

const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const Tag = ({ children }) => <span className="pill bg-stone/10 text-stone">{children}</span>;

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-light pointer-events-none"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input className="lx-input pl-9 pr-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone hover:text-ink text-base leading-none">×</button>
      )}
    </div>
  );
}

export default function FaultsRenovations() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [faults, setFaults] = useState([]);
  const [renovations, setRenovations] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);

  const [faultForm, setFaultForm] = useState(emptyFault);
  const [renoForm, setRenoForm] = useState(emptyReno);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [showRenoForm, setShowRenoForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [tab, setTab] = useState('faults');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [fFilter, setFFilter] = useState({ status: '', type: '', unit: '' });
  const [rFilter, setRFilter] = useState({ type: '', unit: '' });
  const [xFilter, setXFilter] = useState({ category: '', unit: '' });

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

  const reporterSelectValue = faultForm.tenant_id
    ? `tenant:${faultForm.tenant_id}`
    : faultForm.reporter_name || faultForm._other ? 'other' : '';
  const onReporterSelect = (v) => {
    if (v === '') setFaultForm({ ...faultForm, tenant_id: '', reporter_name: '', reporter_contact: '', _other: false });
    else if (v === 'other') setFaultForm({ ...faultForm, tenant_id: '', _other: true });
    else setFaultForm({ ...faultForm, tenant_id: v.replace('tenant:', ''), reporter_name: '', reporter_contact: '', _other: false });
  };

  // ---- handlers ----
  const submitFault = async (e) => {
    e.preventDefault(); setError('');
    try {
      const { _other, ...payload } = faultForm;
      await createFault(payload);
      setFaultForm(emptyFault); setShowFaultForm(false);
      getFaults().then(setFaults);
    } catch (err) { setError(readApiError(err, 'log that fault')); }
  };
  const setFaultStatus = async (id, status) => {
    setError(''); setBusyId(id);
    try {
      await updateFault(id, { status, resolved_date: status === 'resolved' ? today() : '' });
      getFaults().then(setFaults);
    } catch (err) { setError(readApiError(err, 'update that fault')); } finally { setBusyId(null); }
  };
  const removeFault = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteFault(id); getFaults().then(setFaults); }
    catch (err) { setError(readApiError(err, 'delete that fault')); } finally { setBusyId(null); }
  };

  const submitReno = async (e) => {
    e.preventDefault(); setError('');
    try {
      await createRenovation(renoForm);
      setRenoForm(emptyReno); setShowRenoForm(false);
      getRenovations().then(setRenovations);
    } catch (err) { setError(readApiError(err, 'log that renovation')); }
  };
  const removeReno = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteRenovation(id); getRenovations().then(setRenovations); }
    catch (err) { setError(readApiError(err, 'delete that renovation')); } finally { setBusyId(null); }
  };

  const submitExpense = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (editingExpenseId) await updateExpense(editingExpenseId, expenseForm);
      else await createExpense(expenseForm);
      setExpenseForm(emptyExpense); setShowExpenseForm(false); setEditingExpenseId(null);
      getExpenses().then(setExpenses);
    } catch (err) { setError(readApiError(err, editingExpenseId ? 'update that expense' : 'record that expense')); }
  };
  const startEditExpense = (x) => {
    setEditingExpenseId(x.id); setShowExpenseForm(true);
    setExpenseForm({
      unit_id: x.unit_id || '', category_id: x.category_id || '', amount: x.amount ?? '',
      expense_date: x.expense_date || '', description: x.description || '', receipt_url: x.receipt_url || '',
    });
  };
  const cancelExpense = () => { setShowExpenseForm(false); setEditingExpenseId(null); setExpenseForm(emptyExpense); };
  const removeExpense = async (id) => {
    setError(''); setBusyId(id);
    try { await deleteExpense(id); getExpenses().then(setExpenses); }
    catch (err) { setError(readApiError(err, 'delete that expense')); } finally { setBusyId(null); }
  };

  // ---- derived ----
  const countBy = (arr, keyFn) => arr.reduce((m, x) => { const k = keyFn(x); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
  const has = (v) => v != null && v !== '';

  const openFaults = faults.filter((f) => f.status !== 'resolved').length;
  const repairsCost = faults.reduce((s, f) => s + num(f.cost), 0) + expenses.reduce((s, x) => s + num(x.amount), 0);
  const renoCost = renovations.reduce((s, r) => s + num(r.cost), 0);

  const s = search.trim().toLowerCase();
  const match = (parts) => !s || parts.some((v) => String(v || '').toLowerCase().includes(s));

  const shownFaults = faults.filter((f) =>
    (!fFilter.status || f.status === fFilter.status) &&
    (!fFilter.type || f.fault_type === fFilter.type) &&
    (!fFilter.unit || f.unit_id === fFilter.unit) &&
    match([unitLabel(f.unit_id), f.description, f.fault_type, reporterOf(f)?.label]));
  const shownRenos = renovations.filter((r) =>
    (!rFilter.type || r.reno_type === rFilter.type) &&
    (!rFilter.unit || r.unit_id === rFilter.unit) &&
    match([unitLabel(r.unit_id), r.description, r.reno_type]));
  const shownExpenses = expenses.filter((x) =>
    (!xFilter.category || x.category_id === xFilter.category) &&
    (!xFilter.unit || x.unit_id === xFilter.unit) &&
    match([unitLabel(x.unit_id), x.description, x.category_name]));

  // Build a facet group (All + present options with counts).
  const facet = (label, current, setVal, options) => ({
    label,
    items: [
      { key: '__all', label: 'All', count: options.reduce((t, o) => t + o.count, 0), active: !current, onClick: () => setVal('') },
      ...options.map((o) => ({ key: o.key, label: o.label, count: o.count, active: current === o.key, onClick: () => setVal(o.key) })),
    ],
  });
  const unitFacet = (arr, current, setVal) => {
    const c = countBy(arr, (x) => x.unit_id);
    const opts = units.filter((u) => c[u.id]).map((u) => ({ key: u.id, label: u.unit_code, count: c[u.id] }));
    return opts.length ? facet('Apartment', current, setVal, opts) : null;
  };

  let sideGroups = [];
  if (tab === 'faults') {
    const byStatus = countBy(faults, (f) => f.status);
    const byType = countBy(faults, (f) => f.fault_type);
    sideGroups = [
      facet('Status', fFilter.status, (v) => setFFilter({ ...fFilter, status: v }),
        FAULT_STATUSES.map(([v, l]) => ({ key: v, label: l, count: byStatus[v] || 0 }))),
      Object.keys(byType).length &&
        facet('Type', fFilter.type, (v) => setFFilter({ ...fFilter, type: v }),
          FAULT_TYPES.filter((t) => byType[t]).map((t) => ({ key: t, label: t, count: byType[t] }))),
      unitFacet(faults, fFilter.unit, (v) => setFFilter({ ...fFilter, unit: v })),
    ].filter(Boolean);
  } else if (tab === 'renovations') {
    const byType = countBy(renovations, (r) => r.reno_type);
    sideGroups = [
      Object.keys(byType).length &&
        facet('Type', rFilter.type, (v) => setRFilter({ ...rFilter, type: v }),
          RENO_TYPES.filter((t) => byType[t]).map((t) => ({ key: t, label: t, count: byType[t] }))),
      unitFacet(renovations, rFilter.unit, (v) => setRFilter({ ...rFilter, unit: v })),
    ].filter(Boolean);
  } else {
    const byCat = countBy(expenses, (x) => x.category_id);
    sideGroups = [
      Object.keys(byCat).length &&
        facet('Category', xFilter.category, (v) => setXFilter({ ...xFilter, category: v }),
          categories.filter((c) => byCat[c.id]).map((c) => ({ key: c.id, label: c.name, count: byCat[c.id] }))),
      unitFacet(expenses, xFilter.unit, (v) => setXFilter({ ...xFilter, unit: v })),
    ].filter(Boolean);
  }
  if (sideGroups.length === 0) sideGroups = [{ label: 'Filter', items: [{ key: 'none', label: 'Nothing to filter yet', count: null, active: true, onClick: () => {} }] }];

  const tabs = [
    { key: 'faults', label: 'Faults', count: faults.length },
    { key: 'renovations', label: 'Renovations', count: renovations.length },
    { key: 'expenses', label: 'Expenses', count: expenses.length },
  ];

  const addButton = () => {
    if (!canEdit) return null;
    if (tab === 'faults') return <button onClick={() => setShowFaultForm((v) => !v)} className="lx-btn-primary !py-2 text-xs shrink-0">{showFaultForm ? 'Cancel' : '+ Log fault'}</button>;
    if (tab === 'renovations') return <button onClick={() => setShowRenoForm((v) => !v)} className="lx-btn-primary !py-2 text-xs shrink-0">{showRenoForm ? 'Cancel' : '+ Log renovation'}</button>;
    return <button onClick={() => (showExpenseForm ? cancelExpense() : setShowExpenseForm(true))} className="lx-btn-primary !py-2 text-xs shrink-0">{showExpenseForm ? 'Cancel' : '+ Record expense'}</button>;
  };

  return (
    <div>
      {error && <div className="mb-5 lx-alert lx-alert-danger">{error}</div>}

      {/* KPI hero */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard label="Open faults" value={openFaults} icon={IconWrench} sub={`${faults.length} logged`} />
        <StatCard label="Repairs & costs" value={money(repairsCost)} icon={IconChart} sub="Faults + expenses" />
        <StatCard label="Renovations" value={money(renoCost)} icon={IconHome} sub="Invested in upgrades" />
      </div>

      <div className="grid lg:grid-cols-[236px_1fr] gap-5 lg:gap-6 items-start">
        <SidePanel title="Repairs" groups={sideGroups} />

        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3 mb-4">
            <Tabs tabs={tabs} value={tab} onChange={(k) => { setTab(k); setOpenId(null); }} />
            {addButton()}
          </div>

          <div className="mb-4"><SearchInput value={search} onChange={setSearch} placeholder="Search description, apartment, type…" /></div>

          {/* ---------- FAULTS ---------- */}
          {tab === 'faults' && (
            <>
              {canEdit && showFaultForm && (
                <form onSubmit={submitFault} className="lx-card p-5 mb-4 space-y-3">
                  <Field label="Apartment" required>
                    <select required className="lx-select" value={faultForm.unit_id} onChange={(e) => setFaultForm({ ...faultForm, unit_id: e.target.value })}>
                      <option value="">Select apartment…</option>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                    </select>
                  </Field>
                  <Field label="Type">
                    <select className="lx-select" value={faultForm.fault_type} onChange={(e) => setFaultForm({ ...faultForm, fault_type: e.target.value })}>
                      <option value="">Select type…</option>
                      {FAULT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <TextField label="Description" required hint="What exactly is wrong"
                    value={faultForm.description} onChange={(e) => setFaultForm({ ...faultForm, description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Severity">
                      <select className="lx-select" value={faultForm.severity} onChange={(e) => setFaultForm({ ...faultForm, severity: e.target.value })}>
                        {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    <Field label="Caused by">
                      <select className="lx-select" value={faultForm.caused_by} onChange={(e) => setFaultForm({ ...faultForm, caused_by: e.target.value })}>
                        {CAUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Reported by" hint="A tenant on file, or anyone else.">
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
                      <TextField label="Reporter name" required placeholder="e.g. Security, neighbour"
                        value={faultForm.reporter_name} onChange={(e) => setFaultForm({ ...faultForm, reporter_name: e.target.value })} />
                      <TextField label="Contact" hint="Phone or email (optional)"
                        value={faultForm.reporter_contact} onChange={(e) => setFaultForm({ ...faultForm, reporter_contact: e.target.value })} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Reported date">
                      <input type="date" className="lx-input" value={faultForm.reported_date} onChange={(e) => setFaultForm({ ...faultForm, reported_date: e.target.value })} />
                    </Field>
                    <TextField label="Repair cost" type="number" value={faultForm.cost} onChange={(e) => setFaultForm({ ...faultForm, cost: e.target.value })} />
                  </div>
                  <button className="lx-btn-gold w-full sm:w-auto">Log Fault</button>
                </form>
              )}
              <div className="space-y-2.5">
                {shownFaults.map((f) => (
                  <AccordionRow key={f.id} open={openId === f.id} onToggle={() => setOpenId(openId === f.id ? null : f.id)}
                    title={unitLabel(f.unit_id)}
                    badges={<>{f.fault_type && <Tag>{f.fault_type}</Tag>}<StatusBadge status={f.status} /></>}
                    meta={f.cost ? money(f.cost) : null}>
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
                        <label className="flex items-center gap-2 text-xs text-stone">Status
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
                {shownFaults.length === 0 && <p className="text-stone text-sm py-6 text-center">{faults.length === 0 ? 'No faults logged.' : 'Nothing matches those filters.'}</p>}
              </div>
            </>
          )}

          {/* ---------- RENOVATIONS ---------- */}
          {tab === 'renovations' && (
            <>
              {canEdit && showRenoForm && (
                <form onSubmit={submitReno} className="lx-card p-5 mb-4 space-y-3">
                  <Field label="Apartment" required>
                    <select required className="lx-select" value={renoForm.unit_id} onChange={(e) => setRenoForm({ ...renoForm, unit_id: e.target.value })}>
                      <option value="">Select apartment…</option>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                    </select>
                  </Field>
                  <Field label="Type">
                    <select className="lx-select" value={renoForm.reno_type} onChange={(e) => setRenoForm({ ...renoForm, reno_type: e.target.value })}>
                      <option value="">Select type…</option>
                      {RENO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <TextField label="Description" required hint="e.g. new cabinets & worktop"
                    value={renoForm.description} onChange={(e) => setRenoForm({ ...renoForm, description: e.target.value })} />
                  <TextField label="Cost" required type="number" value={renoForm.cost} onChange={(e) => setRenoForm({ ...renoForm, cost: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start date"><input type="date" className="lx-input" value={renoForm.start_date} onChange={(e) => setRenoForm({ ...renoForm, start_date: e.target.value })} /></Field>
                    <Field label="End date"><input type="date" className="lx-input" value={renoForm.end_date} onChange={(e) => setRenoForm({ ...renoForm, end_date: e.target.value })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Rate before" type="number" value={renoForm.rate_before} onChange={(e) => setRenoForm({ ...renoForm, rate_before: e.target.value })} />
                    <TextField label="Rate after" type="number" value={renoForm.rate_after} onChange={(e) => setRenoForm({ ...renoForm, rate_after: e.target.value })} />
                  </div>
                  <button className="lx-btn-gold w-full sm:w-auto">Log Renovation</button>
                </form>
              )}
              <div className="space-y-2.5">
                {shownRenos.map((r) => (
                  <AccordionRow key={r.id} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                    title={unitLabel(r.unit_id)} badges={r.reno_type ? <Tag>{r.reno_type}</Tag> : null} meta={money(r.cost)}>
                    <div className="text-sm text-ink/90">{r.description}</div>
                    <div className="text-xs text-stone flex flex-wrap gap-x-3 gap-y-1">
                      <span>Cost {money(r.cost)}</span>
                      {has(r.rate_before) && has(r.rate_after) && <span>Rate {money(r.rate_before)} → {money(r.rate_after)}</span>}
                      {(r.start_date || r.end_date) && <span>{r.start_date || '—'} → {r.end_date || 'ongoing'}</span>}
                    </div>
                    {canEdit && (
                      <div className="flex justify-end pt-2 mt-1 border-t border-line/70">
                        <RowActions onDelete={() => removeReno(r.id)} busy={busyId === r.id} deleteLabel="Delete this renovation?" />
                      </div>
                    )}
                  </AccordionRow>
                ))}
                {shownRenos.length === 0 && <p className="text-stone text-sm py-6 text-center">{renovations.length === 0 ? 'No renovations logged.' : 'Nothing matches those filters.'}</p>}
              </div>
            </>
          )}

          {/* ---------- EXPENSES ---------- */}
          {tab === 'expenses' && (
            <>
              {canEdit && showExpenseForm && (
                <form onSubmit={submitExpense} className="lx-card p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Apartment" required>
                    <select required className="lx-select" value={expenseForm.unit_id} onChange={(e) => setExpenseForm({ ...expenseForm, unit_id: e.target.value })}>
                      <option value="">Select apartment…</option>
                      {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                    </select>
                  </Field>
                  <Field label="Category" required>
                    <select required className="lx-select" value={expenseForm.category_id} onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}>
                      <option value="">Select category…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <TextField label="Amount" required type="number" min="0" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                  <Field label="Date" required><input type="date" required className="lx-input" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} /></Field>
                  <TextField label="Description" className="sm:col-span-2" hint="Optional" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
                  <div className="sm:col-span-2">
                    <span className="lx-label">Receipt <span className="text-stone font-normal">— a photo of the receipt (optional)</span></span>
                    {expenseForm.receipt_url ? (
                      <div className="flex items-center gap-3">
                        <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="shrink-0">
                          <img src={expenseForm.receipt_url} alt="Receipt" className="w-16 h-16 rounded-lg object-cover border border-line" /></a>
                        <a href={expenseForm.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-gold hover:underline">View full size</a>
                        <button type="button" onClick={() => setExpenseForm({ ...expenseForm, receipt_url: '' })} className="text-xs text-stone hover:text-rose-600">Remove</button>
                      </div>
                    ) : (
                      <PhotoUploader label="Upload receipt" onUploaded={(urls) => setExpenseForm((f) => ({ ...f, receipt_url: urls[0] }))} />
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
                  <AccordionRow key={x.id} open={openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)}
                    title={unitLabel(x.unit_id)}
                    badges={<><Tag>{x.category_name || x.category || 'Uncategorised'}</Tag>{x.receipt_url && <span className="pill pill-ok">Receipt</span>}</>}
                    meta={money(x.amount)}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 space-y-1">
                        {x.description && <div className="text-sm text-ink/90">{x.description}</div>}
                        <div className="text-stone text-xs">{money(x.amount)}{x.expense_date ? ` · ${x.expense_date}` : ''}</div>
                      </div>
                      {x.receipt_url ? (
                        <a href={x.receipt_url} target="_blank" rel="noreferrer" title="View receipt" className="shrink-0 group">
                          <img src={x.receipt_url} alt="Receipt" className="w-16 h-16 rounded-lg object-cover border border-line group-hover:border-gold transition" />
                          <span className="block text-[10px] text-stone text-center mt-1 group-hover:text-gold">View</span></a>
                      ) : (
                        <span className="shrink-0 text-[11px] text-stone-light border border-dashed border-line rounded-lg px-2 py-1.5">No receipt</span>
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
                  <p className="text-stone text-sm py-6 text-center">
                    {expenses.length === 0 ? 'No expenses recorded yet — your P&L will show zero costs until you add some.' : 'Nothing matches those filters.'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
