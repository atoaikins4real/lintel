import { useEffect, useState } from 'react';
import { getLeases, createLease, getTenants, getUnits } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

const emptyForm = {
  tenant_id: '', unit_id: '', stay_type: 'short_stay', start_date: '', end_date: '',
  agreed_rate: '', rate_period: 'nightly', source: 'direct',
};

export default function Leases() {
  const { canEdit } = useAuth();
  const { money } = useSettings();
  const [leases, setLeases] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => getLeases().then(setLeases);

  useEffect(() => {
    load();
    getTenants().then(setTenants);
    getUnits().then(setUnits);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createLease({ ...form, end_date: form.end_date || null });
      setForm(emptyForm);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const tenantLabel = (id) => {
    const t = tenants.find((t) => t.id === id);
    return t ? `${t.lintel_id} — ${t.first_name} ${t.last_name}` : id;
  };
  const unitLabel = (id) => {
    const u = units.find((u) => u.id === id);
    return u ? u.unit_code : id;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">From a 2-night stay to a multi-year residency.</p>
        {canEdit && (
          <button onClick={() => setShowForm((s) => !s)} className="lx-btn-primary w-full sm:w-auto">
            {showForm ? 'Cancel' : '+ New Lease'}
          </button>
        )}
      </div>

      {canEdit && showForm && (
        <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <select required className="lx-select sm:col-span-2" value={form.tenant_id}
            onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
            <option value="">Select tenant…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.lintel_id} — {t.first_name} {t.last_name}</option>)}
          </select>
          <select required className="lx-select" value={form.unit_id}
            onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
            <option value="">Select unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
          </select>
          <select className="lx-select" value={form.stay_type}
            onChange={(e) => setForm({ ...form, stay_type: e.target.value })}>
            <option value="short_stay">Short stay</option>
            <option value="long_stay">Long stay</option>
          </select>
          <select className="lx-select" value={form.rate_period}
            onChange={(e) => setForm({ ...form, rate_period: e.target.value })}>
            <option value="nightly">Nightly</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input type="number" required placeholder="Agreed rate" className="lx-input"
            value={form.agreed_rate} onChange={(e) => setForm({ ...form, agreed_rate: e.target.value })} />
          <input type="date" required className="lx-input"
            value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <input type="date" placeholder="End date (optional)" className="lx-input"
            value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          <input placeholder="Source (direct, airbnb…)" className="lx-input"
            value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <button disabled={saving} className="lx-btn-gold sm:col-span-2 lg:col-span-3 justify-self-start w-full sm:w-auto">
            {saving ? 'Saving…' : 'Create Lease'}
          </button>
        </form>
      )}

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[680px]">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Type</th>
                <th>Dates</th>
                <th className="text-right">Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leases.map((l) => (
                <tr key={l.id}>
                  <td>{tenantLabel(l.tenant_id)}</td>
                  <td>{unitLabel(l.unit_id)}</td>
                  <td className="capitalize">{l.stay_type.replace('_', ' ')}</td>
                  <td>{l.start_date} → {l.end_date || 'ongoing'}</td>
                  <td className="text-right">{money(l.agreed_rate)}/{l.rate_period}</td>
                  <td><StatusBadge status={l.status} /></td>
                </tr>
              ))}
              {leases.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-stone">No leases yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
