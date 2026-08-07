import { useEffect, useState } from 'react';
import { updateSettings, getCompany, updateCompany, readApiError } from '../api/client.js';
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

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  useEffect(() => {
    getCompany()
      .then(setCompanyForm)
      .catch((err) => setError(readApiError(err, 'load your company profile')));
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

      {/* Subscription */}
      <section className="lx-card p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink mb-1">Your Lintel subscription</h2>
        <p className="text-xs text-stone mb-4">
          Tracked for your records only — nothing is restricted based on this.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone mb-1">Plan</label>
            <input
              className="lx-input" placeholder="e.g. Starter" disabled={!isManager}
              value={form.subscription_plan || ''} onChange={(e) => set({ subscription_plan: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Status</label>
            <select
              className="lx-select" disabled={!isManager}
              value={form.subscription_status || 'trial'}
              onChange={(e) => set({ subscription_status: e.target.value })}
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Started on</label>
            <input
              type="date" className="lx-input" disabled={!isManager}
              value={form.subscription_started_on || ''} onChange={(e) => set({ subscription_started_on: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Renews on</label>
            <input
              type="date" className="lx-input" disabled={!isManager}
              value={form.subscription_renews_on || ''} onChange={(e) => set({ subscription_renews_on: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Amount</label>
            <input
              type="number" className="lx-input" placeholder="0.00" disabled={!isManager}
              value={form.subscription_amount ?? ''} onChange={(e) => set({ subscription_amount: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-stone mb-1">Billed in</label>
            <select
              className="lx-select" disabled={!isManager}
              value={form.subscription_currency || 'GHS'}
              onChange={(e) => set({ subscription_currency: e.target.value })}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {isManager && (
        <button disabled={saving} className="lx-btn-primary">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      )}
    </form>
  );
}
