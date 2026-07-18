import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTenants, createTenant } from '../api/client.js';
import TierBadge from '../components/TierBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const emptyForm = { first_name: '', last_name: '', email: '', phone: '', nationality: '' };

export default function Tenants() {
  const { canEdit } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => getTenants(search ? { search } : undefined).then(setTenants);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createTenant(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <p className="text-stone text-sm">Every guest and resident, tracked under one permanent Lintel ID.</p>
        {canEdit && (
          <button onClick={() => setShowForm((s) => !s)} className="lx-btn-primary sm:w-auto w-full">
            {showForm ? 'Cancel' : '+ New Tenant'}
          </button>
        )}
      </div>

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

      <input
        placeholder="Search by name, email, or Lintel ID…"
        className="lx-input mb-5 sm:max-w-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="lx-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full lx-table min-w-[560px]">
            <thead>
              <tr>
                <th>Lintel ID</th>
                <th>Name</th>
                <th>Tier</th>
                <th className="text-right">Score</th>
                <th className="text-right">Stays</th>
                <th className="text-right">On-time %</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tenants/${t.id}`} className="font-medium text-ink hover:text-gold transition">
                      {t.lintel_id}
                    </Link>
                  </td>
                  <td>{t.first_name} {t.last_name}</td>
                  <td><TierBadge tier={t.tier} /></td>
                  <td className="text-right">{t.score}</td>
                  <td className="text-right">{t.total_stays}</td>
                  <td className="text-right">{t.on_time_payment_rate}%</td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-stone">No tenants yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
