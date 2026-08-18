import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTenants, createTenant, deleteTenant, readApiError } from '../api/client.js';
import TierBadge from '../components/TierBadge.jsx';
import RowActions from '../components/RowActions.jsx';
import SearchBar, { useSearch } from '../components/SearchBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', nationality: '' };

export default function Tenants() {
  const { canEdit, isManager } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [tierFilter, setTierFilter] = useState('');
  const [onboardingFilter, setOnboardingFilter] = useState('');

  // Filtering happens in the browser now rather than refetching on every
  // keystroke — the list is already loaded, so this is instant.
  const { query, setQuery, results: shownTenants } = useSearch(
    tenants,
    ['lintel_id', 'first_name', 'last_name', 'email', 'phone', 'nationality',
      (t) => `${t.first_name} ${t.last_name}`],
    (t) =>
      (!tierFilter || t.tier === tierFilter) &&
      (!onboardingFilter || t.onboarding_status === onboardingFilter)
  );

  const load = () =>
    getTenants()
      .then(setTenants)
      .catch((err) => setError(readApiError(err, 'load tenants')));

  useEffect(() => {
    load();
  }, []);

  const remove = async (id) => {
    setError('');
    setBusyId(id);
    try {
      await deleteTenant(id);
      load();
    } catch (err) {
      setError(readApiError(err, 'delete that tenant'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createTenant(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      // Previously this had no catch at all, so a failed create looked
      // like nothing happened — no error, no feedback.
      setError(readApiError(err, 'create tenant'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Every guest and resident, tracked under one permanent Lintel ID.</p>
        {canEdit && (
          <div className="flex gap-3 w-full sm:w-auto">
            <Link to="/tenants/onboard" className="lx-btn-primary flex-1 sm:flex-none text-center">
              + Onboard Tenant
            </Link>
            <button onClick={() => setShowForm((s) => !s)} className="lx-btn-ghost flex-1 sm:flex-none">
              {showForm ? 'Cancel' : 'Quick add'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {canEdit && showForm && (
        <form onSubmit={handleSubmit} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input required placeholder="First name" className="lx-input"
            value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <input required placeholder="Last name" className="lx-input"
            value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <input placeholder="Email" className="lx-input"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Phone" className="lx-input"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Nationality" className="lx-input sm:col-span-2"
            value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
          <button disabled={saving} className="lx-btn-gold sm:col-span-2 justify-self-start w-full sm:w-auto">
            {saving ? 'Saving…' : 'Create Tenant (assigns Lintel ID)'}
          </button>
        </form>
      )}

      <SearchBar
        value={query} onChange={setQuery}
        placeholder="Search name, email, phone, Lintel ID…"
        count={shownTenants.length} total={tenants.length}
      >
        <select className="lx-select !py-2 text-sm w-auto" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
          <option value="">Any tier</option>
          <option value="guest">Guest</option>
          <option value="returning">Returning</option>
          <option value="resident">Resident</option>
          <option value="exclusive">Exclusive</option>
        </select>
        <select className="lx-select !py-2 text-sm w-auto" value={onboardingFilter} onChange={(e) => setOnboardingFilter(e.target.value)}>
          <option value="">Any onboarding</option>
          <option value="in_progress">Setup unfinished</option>
          <option value="complete">Complete</option>
        </select>
      </SearchBar>

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[560px]">
            <thead>
              <tr>
                <th>Lintel ID</th>
                <th>Name</th>
                <th>Onboarding</th>
                <th>Tier</th>
                <th className="text-right">Score</th>
                <th className="text-right">Stays</th>
                <th className="text-right">On-time %</th>
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shownTenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tenants/${t.id}`} className="font-medium text-ink hover:text-gold transition">
                      {t.lintel_id}
                    </Link>
                  </td>
                  <td>{t.first_name} {t.last_name}</td>
                  <td>
                    {t.onboarding_status === 'complete' ? (
                      <span className="pill bg-emerald-50 text-emerald-700">Complete</span>
                    ) : (
                      <Link to={`/tenants/${t.id}/onboard`} className="pill bg-amber-50 text-amber-700 hover:underline">
                        Finish setup
                      </Link>
                    )}
                  </td>
                  <td><TierBadge tier={t.tier} /></td>
                  <td className="text-right">{t.score}</td>
                  <td className="text-right">{t.total_stays}</td>
                  <td className="text-right">{t.on_time_payment_rate}%</td>
                  {canEdit && (
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/tenants/${t.id}/onboard`} className="text-xs text-stone hover:text-ink px-2 py-1">
                          Edit
                        </Link>
                        {isManager && (
                          <RowActions
                            onDelete={() => remove(t.id)}
                            busy={busyId === t.id}
                            deleteLabel="Delete this tenant?"
                          />
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {shownTenants.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-5 py-10 text-center text-stone">
                    {tenants.length === 0 ? 'No tenants yet.' : 'Nothing matches that search.'}
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
