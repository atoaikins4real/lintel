import { useEffect, useState } from 'react';
import {
  updateSettings, getCompany, updateCompany,
  getProperties, getUnits, getStaffUsers, readApiError,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { CURRENCY_LABELS } from '../utils/currency.js';
import PhotoUploader from '../components/PhotoUploader.jsx';

const MOBILE_PROVIDERS = ['MTN Mobile Money', 'Telecel Cash', 'AirtelTigo Money', 'Other'];

export default function Settings() {
  const { isManager, setCompany } = useAuth();
  const { settings, setSettings } = useSettings();
  const [form, setForm] = useState(null);
  const [companyForm, setCompanyForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [usage, setUsage] = useState({ properties: 0, units: 0, staff: 0 });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    getCompany()
      .then(setCompanyForm)
      .catch((err) => setError(readApiError(err, 'load your company profile')));
  }, []);

  // Current usage, so plan limits are visible before they bite.
  useEffect(() => {
    Promise.all([getProperties(), getUnits(), getStaffUsers().catch(() => [])])
      .then(([properties, units, staff]) =>
        setUsage({ properties: properties.length, units: units.length, staff: staff.length })
      )
      .catch(() => {});
  }, []);

  if (!form || !companyForm) return <div className="text-stone text-sm">Loading&hellip;</div>;

  const setCo = (patch) => {
    setCompanyForm({ ...companyForm, ...patch });
    setSaved(false);
  };

  const showcaseUrl = `${window.location.origin}/showcase/${companyForm.slug}`;

  const set = (patch) => {
    setForm({ ...form, ...patch });
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const [updated, updatedCompany] = await Promise.all([
        updateSettings(form),
        updateCompany(companyForm),
      ]);
      setSettings(updated);
      setForm(updated);
      setCompanyForm(updatedCompany);
      setCompany(updatedCompany);
      setSaved(true);
    } catch (err) {
      setError(readApiError(err, 'save settings'));
    } finally {
      setSaving(false);
    }
  };

  const currencies = form.supported_currencies || Object.keys(CURRENCY_LABELS);

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-6">
      {!isManager && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Only a manager can change these settings — you can view them here.
        </div>
      )}
      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{error}</div>
      )}
      {saved && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          Settings saved.
        </div>
      )}

      {/* Company profile */}
      <section className="lx-card p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink mb-1">Company profile</h2>
        <p className="text-xs text-stone mb-4">
          Shown at the top of your public showcase page and used on tenant-facing documents.
        </p>

        <div className="flex items-center gap-4 mb-4">
          {companyForm.logo_url ? (
            <img src={companyForm.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-line" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-panel border border-line flex items-center justify-center font-serif text-lg text-stone">
              {companyForm.name?.[0]?.toUpperCase() || 'C'}
            </div>
          )}
          {isManager && (
            <div>
              <PhotoUploader onUploaded={(urls) => setCo({ logo_url: urls[0] })} label="Upload logo" />
              {companyForm.logo_url && (
                <button
                  type="button"
                  onClick={() => setCo({ logo_url: '' })}
                  className="text-xs text-stone hover:underline mt-1.5 block"
                >
                  Remove logo
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            className="lx-input sm:col-span-2" placeholder="Company name" disabled={!isManager}
            value={companyForm.name || ''} onChange={(e) => setCo({ name: e.target.value })}
          />
          <input
            className="lx-input" placeholder="Contact email" disabled={!isManager}
            value={companyForm.email || ''} onChange={(e) => setCo({ email: e.target.value })}
          />
          <input
            className="lx-input" placeholder="Contact phone" disabled={!isManager}
            value={companyForm.phone || ''} onChange={(e) => setCo({ phone: e.target.value })}
          />
          <input
            className="lx-input sm:col-span-2" placeholder="Address" disabled={!isManager}
            value={companyForm.address || ''} onChange={(e) => setCo({ address: e.target.value })}
          />
          <input
            className="lx-input" placeholder="City" disabled={!isManager}
            value={companyForm.city || ''} onChange={(e) => setCo({ city: e.target.value })}
          />
          <input
            className="lx-input" placeholder="Country" disabled={!isManager}
            value={companyForm.country || ''} onChange={(e) => setCo({ country: e.target.value })}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-line/70">
          <label className="block text-xs font-medium text-ink mb-1.5">Public showcase link</label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-stone">{window.location.origin}/showcase/</span>
            <input
              className="lx-input flex-1 min-w-[140px]" disabled={!isManager}
              value={companyForm.slug || ''} onChange={(e) => setCo({ slug: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <a href={showcaseUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline">
              Open showcase ↗
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(showcaseUrl)}
              className="text-xs text-stone hover:underline"
            >
              Copy link
            </button>
          </div>
        </div>
      </section>

      {/* Currency */}
      <section className="lx-card p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink mb-1">Currency</h2>
        <p className="text-xs text-stone mb-4">
          Applied to new payments by default. Existing payments keep the currency they were recorded in, so
          mixed-currency portfolios stay accurate.
        </p>
        <select
          className="lx-select w-full sm:max-w-xs"
          disabled={!isManager}
          value={form.default_currency || 'GHS'}
          onChange={(e) => set({ default_currency: e.target.value })}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {CURRENCY_LABELS[c] || c}
            </option>
          ))}
        </select>
      </section>

      {/* Payout */}
      <section className="lx-card p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink mb-1">Where you receive rent</h2>
        <p className="text-xs text-stone mb-4">
          Your payout destination. Recorded here for your records and for inclusion on tenant invoices — Lintel
          doesn&apos;t move money on your behalf.
        </p>

        <div className="flex gap-3 mb-4">
          {[
            { value: 'bank', label: 'Bank account' },
            { value: 'mobile_money', label: 'Mobile money' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={!isManager}
              onClick={() => set({ payout_method: opt.value })}
              className={`px-4 py-2 rounded-xl text-sm border transition ${
                form.payout_method === opt.value
                  ? 'border-gold bg-gold/10 text-ink font-medium'
                  : 'border-line text-stone hover:border-stone/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {form.payout_method === 'bank' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="lx-input" placeholder="Bank name" disabled={!isManager}
              value={form.payout_bank_name || ''} onChange={(e) => set({ payout_bank_name: e.target.value })}
            />
            <input
              className="lx-input" placeholder="Account name" disabled={!isManager}
              value={form.payout_account_name || ''} onChange={(e) => set({ payout_account_name: e.target.value })}
            />
            <input
              className="lx-input" placeholder="Account number" disabled={!isManager}
              value={form.payout_account_number || ''} onChange={(e) => set({ payout_account_number: e.target.value })}
            />
            <input
              className="lx-input" placeholder="Branch (optional)" disabled={!isManager}
              value={form.payout_branch || ''} onChange={(e) => set({ payout_branch: e.target.value })}
            />
          </div>
        )}

        {form.payout_method === 'mobile_money' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              className="lx-select" disabled={!isManager}
              value={form.payout_mobile_provider || ''}
              onChange={(e) => set({ payout_mobile_provider: e.target.value })}
            >
              <option value="">Select provider…</option>
              {MOBILE_PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              className="lx-input" placeholder="Mobile money number" disabled={!isManager}
              value={form.payout_mobile_number || ''} onChange={(e) => set({ payout_mobile_number: e.target.value })}
            />
            <input
              className="lx-input sm:col-span-2" placeholder="Registered account name" disabled={!isManager}
              value={form.payout_account_name || ''} onChange={(e) => set({ payout_account_name: e.target.value })}
            />
          </div>
        )}

        {!form.payout_method && <p className="text-sm text-stone">Choose how you&apos;d like to receive rent.</p>}
      </section>

      {/* Subscription — read-only. Managed by the Lintel operator via
          /api/admin, so a subscriber can't mark themselves as paid. */}
      <section className="lx-card p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink mb-1">Your Lintel subscription</h2>
        <p className="text-xs text-stone mb-4">
          Managed by Lintel. Get in touch if anything here looks wrong.
        </p>
        {form.subscription ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Detail label="Plan" value={form.subscription.l_plans?.name || 'No plan assigned'} />
            <Detail
              label="Status"
              value={(form.subscription.status || '').replace('_', ' ')}
              capitalize
            />
            <Detail label="Started" value={form.subscription.started_on} />
            <Detail label="Trial ends" value={form.subscription.trial_ends_on} />
            <Detail label="Renews" value={form.subscription.renews_on} />
            <Detail
              label="Amount"
              value={
                form.subscription.amount
                  ? `${form.subscription.currency} ${Number(form.subscription.amount).toLocaleString()}`
                  : null
              }
            />
            {form.subscription.l_plans && (
              <div className="sm:col-span-2 pt-2">
                <div className="lx-eyebrow mb-2">Plan usage</div>
                <div className="grid grid-cols-3 gap-3">
                  <Usage label="Properties" used={usage.properties} limit={form.subscription.l_plans.max_properties} />
                  <Usage label="Units" used={usage.units} limit={form.subscription.l_plans.max_units} />
                  <Usage label="Staff" used={usage.staff} limit={form.subscription.l_plans.max_staff} />
                </div>
                <p className="text-[11px] text-stone mt-2">
                  Reaching a limit only stops you adding new records — nothing already entered is affected.
                </p>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-sm text-stone">No subscription on file yet.</p>
        )}
      </section>

      {isManager && (
        <button disabled={saving} className="lx-btn-primary">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      )}
    </form>
  );
}

function Detail({ label, value, capitalize }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="text-stone">{label}</dt>
      <dd className={`text-right ${value ? 'text-ink' : 'text-stone-light'} ${capitalize ? 'capitalize' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  );
}

function Usage({ label, used, limit }) {
  const unlimited = limit === null || limit === undefined;
  const atLimit = !unlimited && used >= limit;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="bg-panel rounded-xl px-3 py-2.5">
      <div className="text-[11px] text-stone mb-0.5">{label}</div>
      <div className={`font-sans font-bold text-sm ${atLimit ? 'text-rose-700' : 'text-ink'}`}>
        {used}
        <span className="font-normal text-stone"> / {unlimited ? '\u221e' : limit}</span>
      </div>
      {!unlimited && (
        <div className="h-1 rounded-full bg-line overflow-hidden mt-1.5">
          <div className={`h-full rounded-full ${atLimit ? 'bg-rose-500' : 'bg-gold'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
