import { useEffect, useState } from 'react';
import { getSubscribers, updateSubscription, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatMoney } from '../utils/currency.js';

// Platform-owner dashboard: every company subscribed to Lintel, what
// they're on, and what they're actually using. Not visible to subscribers
// — the API 404s for anyone without the platform-admin flag.
const STATUS_STYLE = {
  trial: 'bg-sky-50 text-sky-700',
  active: 'bg-emerald-50 text-emerald-700',
  past_due: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-stone/10 text-stone',
};

export default function Admin() {
  const { isPlatformAdmin } = useAuth();
  const [subscribers, setSubscribers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    getSubscribers()
      .then((res) => {
        setSubscribers(res.subscribers);
        setPlans(res.plans);
      })
      .catch((err) => setError(readApiError(err, 'load subscribers')));

  useEffect(() => {
    if (isPlatformAdmin) load();
  }, [isPlatformAdmin]);

  if (!isPlatformAdmin) {
    return <div className="text-stone text-sm">This area is for the Lintel operator only.</div>;
  }

  const startEdit = (s) => {
    setEditing(s.id);
    setForm({
      plan_id: s.subscription?.plan_id || '',
      status: s.subscription?.status || 'trial',
      started_on: s.subscription?.started_on || '',
      trial_ends_on: s.subscription?.trial_ends_on || '',
      renews_on: s.subscription?.renews_on || '',
      amount: s.subscription?.amount ?? '',
      currency: s.subscription?.currency || 'GHS',
      notes: s.subscription?.notes || '',
    });
  };

  const save = async (companyId) => {
    setError('');
    setSaving(true);
    try {
      await updateSubscription(companyId, form);
      setEditing(null);
      load();
    } catch (err) {
      setError(readApiError(err, 'update that subscription'));
    } finally {
      setSaving(false);
    }
  };

  const totals = subscribers.reduce(
    (acc, s) => {
      acc[s.subscription?.status || 'trial'] = (acc[s.subscription?.status || 'trial'] || 0) + 1;
      if (s.subscription?.status === 'active') acc.mrr += Number(s.subscription.amount || 0);
      return acc;
    },
    { mrr: 0 }
  );

  return (
    <div>
      <p className="text-stone text-sm mb-5">
        Every company subscribed to Lintel. Subscribers can see their own plan but cannot change it — only you can.
      </p>

      {error && (
        <div className="mb-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Subscribers" value={subscribers.length} />
        <Stat label="Active" value={totals.active || 0} />
        <Stat label="Trial" value={totals.trial || 0} />
        <Stat label="Past due" value={totals.past_due || 0} />
        <Stat label="Monthly revenue" value={formatMoney(totals.mrr, 'GHS')} />
      </div>

      <div className="lx-card divide-y divide-line/70">
        {subscribers.map((s) => (
          <div key={s.id} className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-ink">{s.name}</span>
                  <span className={`pill capitalize ${STATUS_STYLE[s.subscription?.status] || STATUS_STYLE.cancelled}`}>
                    {(s.subscription?.status || 'none').replace('_', ' ')}
                  </span>
                  {s.plan && <span className="pill bg-gold/10 text-gold">{s.plan.name}</span>}
                  {s.is_overdue && <span className="pill bg-rose-50 text-rose-700">Overdue</span>}
                </div>
                <div className="text-xs text-stone">
                  /{s.slug}
                  {s.email ? ` · ${s.email}` : ''}
                  {s.city ? ` · ${s.city}` : ''}
                  {' · joined '}
                  {new Date(s.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs text-stone mt-1">
                  {s.usage.properties} properties · {s.usage.units} units · {s.usage.tenants} tenants ·{' '}
                  {s.usage.staff} staff
                  {s.subscription?.renews_on
                    ? ` · renews ${s.subscription.renews_on}${
                        s.days_until_renewal !== null ? ` (${s.days_until_renewal}d)` : ''
                      }`
                    : ''}
                </div>
                {s.subscription?.notes && (
                  <div className="text-xs text-stone italic mt-1">{s.subscription.notes}</div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm text-ink font-medium">
                  {s.subscription?.amount
                    ? formatMoney(s.subscription.amount, s.subscription.currency)
                    : '—'}
                </span>
                <button
                  onClick={() => (editing === s.id ? setEditing(null) : startEdit(s))}
                  className="lx-btn-ghost text-xs px-3 py-1.5"
                >
                  {editing === s.id ? 'Cancel' : 'Manage'}
                </button>
              </div>
            </div>

            {editing === s.id && (
              <div className="mt-4 pt-4 border-t border-line/70 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-stone mb-1">Plan</label>
                  <select className="lx-select" value={form.plan_id}
                    onChange={(e) => setForm({ ...form, plan_id: e.target.value })}>
                    <option value="">No plan</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatMoney(p.price, p.currency)}/{p.billing_interval}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Status</label>
                  <select className="lx-select" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="past_due">Past due</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Amount charged</label>
                  <input type="number" className="lx-input" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Started on</label>
                  <input type="date" className="lx-input" value={form.started_on}
                    onChange={(e) => setForm({ ...form, started_on: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Trial ends</label>
                  <input type="date" className="lx-input" value={form.trial_ends_on}
                    onChange={(e) => setForm({ ...form, trial_ends_on: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-stone mb-1">Renews on</label>
                  <input type="date" className="lx-input" value={form.renews_on}
                    onChange={(e) => setForm({ ...form, renews_on: e.target.value })} />
                </div>
                <input className="lx-input sm:col-span-3" placeholder="Internal notes (not shown to the subscriber)"
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                <button disabled={saving} onClick={() => save(s.id)} className="lx-btn-primary justify-self-start">
                  {saving ? 'Saving…' : 'Save subscription'}
                </button>
              </div>
            )}
          </div>
        ))}
        {subscribers.length === 0 && <div className="p-6 text-stone text-sm">No subscribers yet.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="lx-card p-4">
      <div className="lx-eyebrow mb-1">{label}</div>
      <div className="font-sans font-bold text-lg text-ink">{value}</div>
    </div>
  );
}
