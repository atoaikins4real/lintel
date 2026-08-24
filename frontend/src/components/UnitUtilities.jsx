// Utilities configured on ONE apartment.
//
// Deliberately per-unit rather than per-property. Subscribers hold very
// different stock — a bought flat in a high-rise carries a service charge
// and generator diesel, a self-built house carries neither but pays waste
// and recycling — so forcing one building's arrangement onto every
// apartment inside it would be wrong more often than right.
import { useEffect, useState } from 'react';
import {
  getUtilityTypes, getUnitUtilities, addUnitUtility,
  updateUnitUtility, deleteUnitUtility, readApiError,
} from '../api/client.js';
import { useSettings } from '../context/SettingsContext.jsx';

const PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function UnitUtilities({ unitId, canEdit, currency }) {
  const { money } = useSettings();
  const [types, setTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ utility_type_id: '', amount: '', billing_period: 'monthly', bill_to_tenant: true });

  const load = () =>
    Promise.all([getUnitUtilities(unitId), getUtilityTypes()])
      .then(([u, t]) => { setRows(u); setTypes(t); })
      .catch((err) => setError(readApiError(err, 'load utilities for this apartment')));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    setBusyId('new');
    try {
      await addUnitUtility(unitId, form);
      setForm({ utility_type_id: '', amount: '', billing_period: 'monthly', bill_to_tenant: true });
      setAdding(false);
      await load();
    } catch (err) {
      setError(readApiError(err, 'add that utility'));
    } finally {
      setBusyId(null);
    }
  };

  const patch = async (row, changes) => {
    setError('');
    setBusyId(row.id);
    try {
      await updateUnitUtility(unitId, row.id, changes);
      await load();
    } catch (err) {
      setError(readApiError(err, 'update that utility'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    setError('');
    setBusyId(row.id);
    try {
      await deleteUnitUtility(unitId, row.id);
      await load();
    } catch (err) {
      setError(readApiError(err, 'remove that utility'));
    } finally {
      setBusyId(null);
    }
  };

  // Only offer utilities not already on this apartment.
  const used = new Set(rows.map((r) => r.utility_type_id));
  const available = types.filter((t) => !used.has(t.id));

  const billedTotal = rows
    .filter((r) => r.is_active && r.bill_to_tenant && r.billing_period === 'monthly')
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="lx-card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <div className="font-serif text-lg text-ink">Utilities</div>
          <p className="text-stone text-xs mt-0.5">
            What this apartment is charged for. Amounts are fixed per period.
          </p>
        </div>
        {canEdit && available.length > 0 && (
          <button onClick={() => setAdding((s) => !s)} className="lx-btn-ghost !px-3 !py-1.5 text-xs shrink-0">
            {adding ? 'Cancel' : '+ Add utility'}
          </button>
        )}
      </div>

      {error && (
        <div className="my-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      {canEdit && adding && (
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4 pb-4 border-b border-line/70">
          <select required className="lx-select" value={form.utility_type_id}
            onChange={(e) => setForm({ ...form, utility_type_id: e.target.value })}>
            <option value="">Select utility…</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="number" min="0" step="any" required placeholder={`Amount (${currency || ''})`}
            className="lx-input" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="lx-select" value={form.billing_period}
            onChange={(e) => setForm({ ...form, billing_period: e.target.value })}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.bill_to_tenant}
              onChange={(e) => setForm({ ...form, bill_to_tenant: e.target.checked })} />
            Charge this to the tenant
          </label>
          <div className="sm:col-span-2">
            <button className="lx-btn-gold" disabled={busyId === 'new'}>
              {busyId === 'new' ? 'Adding…' : 'Add utility'}
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-stone text-sm mt-3">
          No utilities set up for this apartment yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2 border-b border-line/60 last:border-0 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <div className={`text-sm ${r.is_active ? 'text-ink' : 'text-stone-light line-through'}`}>
                  {r.utility_name}
                  {!r.bill_to_tenant && (
                    <span className="pill bg-stone/10 text-stone ml-2">Not charged to tenant</span>
                  )}
                </div>
                <div className="text-xs text-stone mt-0.5">
                  {money(r.amount, currency)} · {PERIODS.find((p) => p.value === r.billing_period)?.label}
                </div>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => patch(r, { bill_to_tenant: !r.bill_to_tenant })}
                    disabled={busyId === r.id}
                    className="text-xs text-stone hover:text-ink px-1.5 disabled:opacity-50">
                    {r.bill_to_tenant ? 'Absorb' : 'Charge tenant'}
                  </button>
                  <button onClick={() => patch(r, { is_active: !r.is_active })}
                    disabled={busyId === r.id}
                    className="text-xs text-stone hover:text-ink px-1.5 disabled:opacity-50">
                    {r.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => remove(r)} disabled={busyId === r.id}
                    className="text-xs text-rose-700 hover:text-rose-800 px-1.5 disabled:opacity-50">
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {billedTotal > 0 && (
        <p className="text-xs text-stone mt-3 pt-3 border-t border-line/70">
          {money(billedTotal, currency)} a month is added to this tenant&rsquo;s charges on top of rent,
          as separate lines on their statement.
        </p>
      )}
    </div>
  );
}
