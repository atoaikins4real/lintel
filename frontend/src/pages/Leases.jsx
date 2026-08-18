import { useEffect, useState } from 'react';
import { getLeases, createLease, updateLease, deleteLease, getTenants, getUnits, readApiError } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import RowActions from '../components/RowActions.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
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
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () =>
    getLeases()
      .then(setLeases)
      .catch((err) => setError(readApiError(err, 'load leases')));

  // Units are reloaded after any change, because ending a lease can flip
  // its unit back to vacant and the label should reflect that.
  const reloadAll = () => Promise.all([load(), getUnits().then(setUnits)]);

  useEffect(() => {
    load();
    getTenants().then(setTenants);
    getUnits().then(setUnits);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createLease({ ...form, end_date: form.end_date || null });
      setForm(emptyForm);
      setShowForm(false);
      reloadAll();
    } catch (err) {
      setError(readApiError(err, 'create that lease'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (l) => {
    if (editingId === l.id) return setEditingId(null);
    setEditingId(l.id);
    setEdit({
      start_date: l.start_date || '',
      end_date: l.end_date || '',
      agreed_rate: l.agreed_rate ?? '',
      status: l.status,
    });
  };

  const save = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await updateLease(id, edit);
      setEditingId(null);
      await reloadAll();
    } catch (err) {
      setError(readApiError(err, 'update that lease'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteLease(id);
      await reloadAll();
    } catch (err) {
      setError(readApiError(err, 'delete that lease'));
    } finally {
      setBusyId(null);
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

  // Searches the resolved tenant and unit labels, not the raw ids, so
  // typing a tenant's name or a unit code actually finds the lease.
  const { query, setQuery, results: shownLeases } = useSearch(
    leases,
    [(l) => tenantLabel(l.tenant_id), (l) => unitLabel(l.unit_id), 'source', 'stay_type'],
    (l) => !statusFilter || l.status === statusFilter
  );

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

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      <SearchBar
        value={query} onChange={setQuery} placeholder="Search tenant, unit, source…"
        count={shownLeases.length} total={leases.length}
      >
        <select className="lx-select !py-2 text-sm w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </SearchBar>

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
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shownLeases.map((l) => (
                <tr key={l.id}>
                  <td>{tenantLabel(l.tenant_id)}</td>
                  <td>{unitLabel(l.unit_id)}</td>
                  <td className="capitalize">{l.stay_type.replace('_', ' ')}</td>
                  <td>
                    {editingId === l.id ? (
                      <div className="flex gap-1.5">
                        <input type="date" className="lx-input !py-1 text-xs"
                          value={edit.start_date || ''} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
                        <input type="date" className="lx-input !py-1 text-xs"
                          value={edit.end_date || ''} onChange={(e) => setEdit({ ...edit, end_date: e.target.value })} />
                      </div>
                    ) : (
                      <>{l.start_date} → {l.end_date || 'ongoing'}</>
                    )}
                  </td>
                  <td className="text-right">
                    {editingId === l.id ? (
                      <input type="number" className="lx-input !py-1 text-xs w-24 text-right"
                        value={edit.agreed_rate ?? ''} onChange={(e) => setEdit({ ...edit, agreed_rate: e.target.value })} />
                    ) : (
                      <>{money(l.agreed_rate)}/{l.rate_period}</>
                    )}
                  </td>
                  <td>
                    {editingId === l.id ? (
                      <select className="lx-select !py-1 text-xs" value={edit.status}
                        onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed (frees the unit)</option>
                        <option value="cancelled">Cancelled (frees the unit)</option>
                      </select>
                    ) : (
                      <StatusBadge status={l.status} />
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {editingId === l.id && (
                          <button onClick={() => save(l.id)} disabled={busyId === l.id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-ink text-white">
                            {busyId === l.id ? 'Saving…' : 'Save'}
                          </button>
                        )}
                        <RowActions
                          editing={editingId === l.id}
                          busy={busyId === l.id}
                          onEdit={() => startEdit(l)}
                          onDelete={() => remove(l.id)}
                          deleteLabel="Delete this lease?"
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {shownLeases.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-5 py-10 text-center text-stone">
                    {leases.length === 0 ? 'No leases yet.' : 'Nothing matches that search.'}
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
