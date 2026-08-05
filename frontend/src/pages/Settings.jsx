import { useEffect, useState } from 'react';
import { updateSettings, readApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { CURRENCY_LABELS } from '../utils/currency.js';

const MOBILE_PROVIDERS = ['MTN Mobile Money', 'Telecel Cash', 'AirtelTigo Money', 'Other'];

export default function Settings() {
  const { isManager } = useAuth();
  const { settings, setSettings } = useSettings();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  if (!form) return <div className="text-stone text-sm">Loading&hellip;</div>;

  const set = (patch) => {
    setForm({ ...form, ...patch });
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const updated = await updateSettings(form);
      setSettings(updated);
      setForm(updated);
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
