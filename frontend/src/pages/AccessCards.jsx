import { useEffect, useState } from 'react';
import {
  getCredentials, issueCredential, updateCredential, getAccessEvents,
  getProperties, getUnits, getTenants, readApiError,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const TYPES = [
  { value: 'keycard', label: 'Keycard' },
  { value: 'fob', label: 'Fob' },
  { value: 'pin', label: 'PIN code' },
  { value: 'mobile_key', label: 'Mobile key' },
  { value: 'biometric', label: 'Biometric' },
];

const STATUS_STYLE = {
  active: 'bg-emerald-50 text-emerald-700',
  lost: 'bg-amber-50 text-amber-700',
  revoked: 'bg-rose-50 text-rose-700',
  expired: 'bg-stone/10 text-stone',
};

const emptyForm = {
  card_number: '', credential_type: 'keycard', label: '',
  tenant_id: '', holder_name: '', property_id: '', unit_id: '',
  valid_from: '', valid_until: '', notes: '',
};

export default function AccessCards() {
  const { canEdit } = useAuth();
  const [credentials, setCredentials] = useState([]);
  const [events, setEvents] = useState([]);
  const [properties, setProperties] = useState([]);
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    getCredentials(statusFilter ? { status: statusFilter } : undefined)
      .then(setCredentials)
      .catch((err) => setError(readApiError(err, 'load access cards')));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    getProperties().then(setProperties).catch(() => {});
    getUnits().then(setUnits).catch(() => {});
    getTenants().then(setTenants).catch(() => {});
    getAccessEvents({ limit: 25 }).then(setEvents).catch(() => {});
  }, []);

  const issue = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await issueCredential(form);
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err) {
      setError(readApiError(err, 'issue that card'));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id, status) => {
    setError('');
    setBusyId(id);
    try {
      await updateCredential(id, { status });
      load();
    } catch (err) {
      setError(readApiError(err, 'update that card'));
    } finally {
      setBusyId(null);
    }
  };

  const unitsForProperty = form.property_id
    ? units.filter((u) => u.property_id === form.property_id)
    : units;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <p className="text-stone text-sm">
          Keycards, fobs and PINs issued to tenants, staff and contractors.
        </p>
        <div className="flex gap-3 w-full sm:w-auto">
          <select className="lx-select flex-1 sm:flex-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="lost">Lost</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
          {canEdit && (
            <button onClick={() => setShowForm((s) => !s)} className="lx-btn-primary flex-1 sm:flex-none">
              {showForm ? 'Cancel' : '+ Issue card'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 text-xs text-stone bg-panel border border-line rounded-xl px-4 py-3">
        Lintel records which credentials exist and who holds them. It doesn&apos;t communicate with door hardware
        yet, so issuing a card here doesn&apos;t program or unlock anything physically — connect a lock system later
        and this record becomes its source of truth.
      </div>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      {canEdit && showForm && (
        <form onSubmit={issue} className="lx-card p-5 sm:p-6 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <input
            required placeholder="Card number / serial" className="lx-input"
            value={form.card_number} onChange={(e) => setForm({ ...form, card_number: e.target.value })}
          />
          <select className="lx-select" value={form.credential_type}
            onChange={(e) => setForm({ ...form, credential_type: e.target.value })}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            placeholder="Label (e.g. Spare card 2)" className="lx-input"
            value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
          />

          <select className="lx-select" value={form.tenant_id}
            onChange={(e) => setForm({ ...form, tenant_id: e.target.value, holder_name: '' })}>
            <option value="">Holder: tenant…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.first_name} {t.last_name} ({t.lintel_id})</option>
            ))}
          </select>
          <input
            placeholder="…or holder name (staff/contractor)" className="lx-input sm:col-span-2"
            disabled={Boolean(form.tenant_id)}
            value={form.holder_name} onChange={(e) => setForm({ ...form, holder_name: e.target.value })}
          />

          <select className="lx-select" value={form.property_id}
            onChange={(e) => setForm({ ...form, property_id: e.target.value, unit_id: '' })}>
            <option value="">Property (building access)…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="lx-select" value={form.unit_id}
            onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
            <option value="">Unit (optional)…</option>
            {unitsForProperty.map((u) => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
          </select>
          <div />

          <div>
            <label className="block text-xs text-stone mb-1">Valid from</label>
            <input type="date" className="lx-input"
              value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Valid until</label>
            <input type="date" className="lx-input"
              value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
          </div>
          <div />

          <button disabled={saving} className="lx-btn-gold sm:col-span-2 lg:col-span-3 justify-self-start w-full sm:w-auto">
            {saving ? 'Issuing…' : 'Issue card'}
          </button>
        </form>
      )}

      <div className="lx-card divide-y divide-line/70 mb-8">
        {credentials.map((c) => {
          const holder = c.l_tenants
            ? `${c.l_tenants.first_name} ${c.l_tenants.last_name}`
            : c.holder_name || 'Unassigned';
          return (
            <div key={c.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-ink">{c.card_number}</span>
                  <span className={`pill capitalize ${STATUS_STYLE[c.status] || STATUS_STYLE.expired}`}>{c.status}</span>
                  <span className="pill bg-stone/10 text-stone capitalize">
                    {c.credential_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-xs text-stone">
                  {holder}
                  {c.l_properties?.name ? ` · ${c.l_properties.name}` : ''}
                  {c.l_units?.unit_code ? ` · ${c.l_units.unit_code}` : ''}
                </div>
                {(c.valid_from || c.valid_until) && (
                  <div className="text-xs text-stone mt-0.5">
                    Valid {c.valid_from || 'now'} → {c.valid_until || 'no end date'}
                  </div>
                )}
                {c.revoked_reason && <div className="text-xs text-rose-700 mt-0.5">{c.revoked_reason}</div>}
              </div>

              {canEdit && c.status === 'active' && (
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={busyId === c.id} onClick={() => setStatus(c.id, 'lost')}
                    className="lx-btn-ghost text-xs px-3 py-1.5"
                  >
                    Report lost
                  </button>
                  <button
                    disabled={busyId === c.id} onClick={() => setStatus(c.id, 'revoked')}
                    className="lx-btn-ghost text-xs px-3 py-1.5 text-rose-700"
                  >
                    Revoke
                  </button>
                </div>
              )}
              {canEdit && c.status !== 'active' && (
                <button
                  disabled={busyId === c.id} onClick={() => setStatus(c.id, 'active')}
                  className="lx-btn-ghost text-xs px-3 py-1.5 shrink-0"
                >
                  Reactivate
                </button>
              )}
            </div>
          );
        })}
        {credentials.length === 0 && (
          <div className="p-6 text-stone text-sm">
            No access cards yet{statusFilter ? ` with status "${statusFilter}"` : ''}.
          </div>
        )}
      </div>

      <h3 className="font-serif text-lg text-ink mb-3">Recent door activity</h3>
      <div className="lx-card divide-y divide-line/70">
        {events.map((e) => (
          <div key={e.id} className="p-4 text-sm flex items-center gap-3">
            <span className="flex-1 min-w-0 text-ink">
              {e.l_access_credentials?.card_number || 'Unknown card'} · {e.event_type}
              {e.l_properties?.name ? ` · ${e.l_properties.name}` : ''}
            </span>
            <span className="text-xs text-stone shrink-0">{new Date(e.occurred_at).toLocaleString()}</span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="p-6 text-stone text-sm">
            No door activity recorded. This fills in automatically once reader hardware is connected and posting
            to Lintel — the log is here so none of that history is lost when it is.
          </div>
        )}
      </div>
    </div>
  );
}
