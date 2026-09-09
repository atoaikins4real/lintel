import { useEffect, useState } from 'react';
import {
  updateSettings, getCompany, updateCompany,
  getProperties, getUnits, getTenants, getStaffUsers, readApiError,
  getPlanCatalogue, getMyPlanRequests, requestPlanChange, withdrawPlanRequest,
  getPaymentBanks, linkPaymentAccount, disablePaymentAccount,
} from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { CURRENCY_LABELS } from '../utils/currency.js';
import ExpenseCategories from '../components/ExpenseCategories.jsx';
import UtilityTypes from '../components/UtilityTypes.jsx';
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
  const [usage, setUsage] = useState({ properties: 0, units: 0, tenants: 0, staff: 0 });

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
    Promise.all([getProperties(), getUnits(), getTenants(), getStaffUsers().catch(() => [])])
      .then(([properties, units, tenants, staff]) =>
        setUsage({
          properties: properties.length,
          units: units.length,
          tenants: tenants.length,
          staff: staff.length,
        })
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

      {/* Email delivery status. Only managers see it — it's an operational
          warning, not something a viewer can act on. */}
      {isManager && form.mail_configured === false && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="font-serif text-lg text-amber-900 mb-1">Email is not being sent</h2>
          <p className="text-sm text-amber-900/80 leading-relaxed">
            No mail provider is configured on the server, so Lintel is writing messages to its log
            instead of delivering them. Everything still appears to work from here — but{' '}
            <strong>password reset links never arrive</strong>, so anyone who forgets their password
            is locked out, and tenant statement links and booking notifications go nowhere.
          </p>
          <p className="text-sm text-amber-900/80 mt-2 leading-relaxed">
            Set <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">MAIL_PROVIDER</code> and{' '}
            <code className="text-xs bg-amber-100 px-1 py-0.5 rounded">MAIL_API_KEY</code> in your
            hosting environment variables to fix it.
          </p>
        </section>
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

        <div className="mt-6 pt-5 border-t border-line">
          <h3 className="text-sm font-medium text-ink mb-1">Exchange rates</h3>
          <p className="text-xs text-stone mb-4 leading-relaxed">
            Only used to show a single estimated total when your portfolio spans several currencies.
            Amounts are always stored and displayed in the currency they were agreed or received in —
            a rate here never changes a recorded figure. Leave a rate blank and that currency is
            reported on its own instead of being folded into an estimate.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currencies
              .filter((c) => c !== (form.default_currency || 'GHS'))
              .map((c) => (
                <label key={c} className="flex items-center gap-3">
                  <span className="text-xs text-stone w-28 shrink-0">1 {c} =</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="lx-input flex-1"
                    disabled={!isManager}
                    placeholder={`— no rate set —`}
                    value={form.exchange_rates?.[c] ?? ''}
                    onChange={(e) =>
                      set({
                        exchange_rates: {
                          ...(form.exchange_rates || {}),
                          [c]: e.target.value,
                        },
                      })
                    }
                  />
                  <span className="text-xs text-stone shrink-0">{form.default_currency || 'GHS'}</span>
                </label>
              ))}
          </div>
        </div>
      </section>

      <ExpenseCategories canEdit={isManager} />

      <UtilityTypes canEdit={isManager} />

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

      {/* Online rent payments — link a settlement account so tenants can pay
          from their statement and the money lands with you directly. */}
      <OnlinePayments
        isManager={isManager}
        settings={form}
        onUpdated={(updated) => { setSettings(updated); setForm(updated); }}
      />

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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Usage label="Properties" used={usage.properties} limit={form.subscription.l_plans.max_properties} />
                  <Usage label="Units" used={usage.units} limit={form.subscription.l_plans.max_units} />
                  <Usage label="Tenants" used={usage.tenants} limit={form.subscription.l_plans.max_tenants} />
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

        {/* Self-serve plan changes. A manager can REQUEST a change or a
            cancellation; Lintel applies it (and arranges any payment). The
            subscription above stays operator-controlled — this only records
            a request. */}
        {isManager && (
          <PlanChangeManager
            currentPlanId={form.subscription?.plan_id || null}
            status={form.subscription?.status || null}
          />
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

// Manager-only. Shows the plan catalogue and lets the subscriber request a
// switch or a cancellation; if a request is already pending it shows that
// instead, with a way to withdraw it. Every button is type="button" because
// this renders inside the Settings <form> and must not submit it.
function PlanChangeManager({ currentPlanId, status }) {
  const [plans, setPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  const load = () =>
    Promise.all([getPlanCatalogue().catch(() => []), getMyPlanRequests().catch(() => [])]).then(
      ([cat, reqs]) => {
        setPlans(cat);
        setRequests(reqs);
      }
    );

  useEffect(() => {
    load();
  }, []);

  const pending = requests.find((r) => r.status === 'pending') || null;

  const submit = async (payload) => {
    setError('');
    setBusy(true);
    try {
      await requestPlanChange(payload);
      setNote('');
      setOpen(false);
      await load();
    } catch (err) {
      setError(readApiError(err, 'send that request'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id) => {
    setError('');
    setBusy(true);
    try {
      await withdrawPlanRequest(id);
      await load();
    } catch (err) {
      setError(readApiError(err, 'withdraw that request'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm:col-span-2 mt-5 pt-5 border-t border-line/70">
      <div className="lx-eyebrow mb-2">Change your plan</div>

      {error && (
        <div className="mb-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {pending ? (
        <div className="rounded-xl bg-panel border border-line/70 px-4 py-3">
          <p className="text-sm text-ink">
            {pending.kind === 'cancel'
              ? 'You’ve requested to cancel your subscription.'
              : `You’ve requested to switch to ${pending.l_plans?.name || 'a new plan'}.`}
          </p>
          <p className="text-xs text-stone mt-1">
            Lintel will confirm it (and arrange any payment). Your current plan stays in place until then.
          </p>
          {pending.note && <p className="text-xs text-stone italic mt-1">“{pending.note}”</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => withdraw(pending.id)}
            className="lx-btn-ghost text-xs px-3 py-1.5 mt-3"
          >
            {busy ? 'Working…' : 'Withdraw request'}
          </button>
        </div>
      ) : status === 'cancelled' ? (
        <p className="text-sm text-stone">
          Your subscription is cancelled — get in touch with Lintel to reactivate.
        </p>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="lx-btn-ghost text-sm px-4 py-2">
          Request a plan change
        </button>
      ) : (
        <div>
          <p className="text-xs text-stone mb-3">
            Pick a plan to request. Lintel confirms the change and arranges any payment — nothing changes on
            your account until then.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plans.map((p) => {
              const isCurrent = p.id === currentPlanId;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border px-4 py-3 ${
                    isCurrent ? 'border-gold/50 bg-gold/5' : 'border-line/70'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="text-sm text-stone">
                      {p.price == null
                        ? 'Custom'
                        : `${p.currency} ${Number(p.price).toLocaleString()}/${p.billing_interval}`}
                    </span>
                  </div>
                  {p.description && <p className="text-xs text-stone mt-1">{p.description}</p>}
                  <p className="text-[11px] text-stone mt-1">
                    {fmtLimit(p.max_properties, 'properties')} · {fmtLimit(p.max_units, 'units')} ·{' '}
                    {fmtLimit(p.max_tenants, 'tenants')} · {fmtLimit(p.max_staff, 'staff')}
                  </p>
                  {isCurrent ? (
                    <span className="pill bg-gold/10 text-gold mt-2 inline-block">Current plan</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submit({ kind: 'change', requested_plan_id: p.id, note })}
                      className="lx-btn-primary text-xs px-3 py-1.5 mt-2"
                    >
                      Request this plan
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <input
            className="lx-input mt-3"
            placeholder="Optional note to Lintel (e.g. billing contact, timing)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit({ kind: 'cancel', note })}
              className="text-xs text-rose-700 hover:underline"
            >
              Cancel my subscription instead
            </button>
            <button type="button" onClick={() => setOpen(false)} className="lx-btn-ghost text-xs px-3 py-1.5 ml-auto">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtLimit(value, label) {
  return `${value === null || value === undefined ? '∞' : value} ${label}`;
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

// ------------------------------------------------------------
// Online rent payments — the subscriber links a mobile-money or bank account
// (registered behind the scenes as a Paystack subaccount) that tenant
// payments settle into directly. Lintel is never in the money path.
// ------------------------------------------------------------
function OnlinePayments({ isManager, settings, onUpdated }) {
  const available = settings.online_payments_available;
  const linked = settings.online_payments_linked;
  const enabled = settings.online_payments_enabled;

  const [type, setType] = useState(settings.payout_method === 'bank' ? 'bank' : 'mobile_money');
  const [banks, setBanks] = useState([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState(settings.payout_account_number || '');
  const [accountName, setAccountName] = useState(settings.payout_account_name || '');
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Load the provider/bank list for the chosen type. Paystack identifies each
  // by a code, so the subscriber must pick from this list rather than type a
  // name we couldn't map.
  useEffect(() => {
    if (!available || !isManager) return;
    setLoadingBanks(true);
    setBankCode('');
    getPaymentBanks({ type, country: 'ghana' })
      .then((list) => setBanks(list || []))
      .catch((err) => setError(err?.response?.data?.error || 'Could not load providers.'))
      .finally(() => setLoadingBanks(false));
  }, [type, available, isManager]);

  if (!available) {
    return (
      <section className="lx-card p-5 sm:p-6">
        <h2 className="font-serif text-lg text-ink mb-1">Online rent payments</h2>
        <p className="text-xs text-stone">
          Letting tenants pay rent online isn&apos;t switched on for this workspace yet. Once it is, you&apos;ll be able
          to link the mobile-money or bank account you want rent to land in, and a &ldquo;Pay&rdquo; button appears on
          every tenant&apos;s statement.
        </p>
      </section>
    );
  }

  const link = async () => {
    setError(''); setOk('');
    if (!bankCode || !accountNumber.trim()) {
      setError('Choose a provider and enter your number.');
      return;
    }
    setBusy(true);
    try {
      const updated = await linkPaymentAccount({
        type,
        settlement_bank: bankCode,
        account_number: accountNumber.trim(),
        account_name: accountName.trim(),
      });
      onUpdated(updated);
      setOk('Linked. Tenants can now pay rent online — it settles straight to this account.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not link that account. Check the number and try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (on) => {
    setError(''); setOk('');
    setBusy(true);
    try {
      const updated = on ? await updateSettings({ online_payments_enabled: true }) : await disablePaymentAccount();
      onUpdated(updated);
      setOk(on ? 'Online payments turned on.' : 'Online payments turned off. Your linked account is kept.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not update. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="lx-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="font-serif text-lg text-ink">Online rent payments</h2>
        {linked && (
          <span className={`text-xs px-2.5 py-1 rounded-full border ${enabled ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-stone bg-panel border-line'}`}>
            {enabled ? 'On' : 'Off'}
          </span>
        )}
      </div>
      <p className="text-xs text-stone mb-4">
        Link the account rent should settle into. Tenants then see a &ldquo;Pay&rdquo; button on their statement and pay
        from their phone — the money goes straight to you. Lintel never holds it.
      </p>

      {error && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 mb-3">{error}</div>}
      {ok && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 mb-3">{ok}</div>}

      {!isManager ? (
        <p className="text-sm text-stone">Only a manager can set up online payments.</p>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            {[
              { value: 'mobile_money', label: 'Mobile money' },
              { value: 'bank', label: 'Bank account' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`px-4 py-2 rounded-xl text-sm border transition ${
                  type === opt.value ? 'border-gold bg-gold/10 text-ink font-medium' : 'border-line text-stone hover:border-stone/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select className="lx-select" value={bankCode} onChange={(e) => setBankCode(e.target.value)} disabled={loadingBanks}>
              <option value="">{loadingBanks ? 'Loading…' : type === 'bank' ? 'Select bank…' : 'Select provider…'}</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
            <input
              className="lx-input"
              placeholder={type === 'bank' ? 'Account number' : 'Mobile money number'}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
            <input
              className="lx-input sm:col-span-2"
              placeholder="Account name (as registered)"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button type="button" onClick={link} disabled={busy} className="lx-btn-primary text-sm">
              {busy ? 'Saving…' : linked ? 'Update linked account' : 'Link account'}
            </button>
            {linked && (
              <button type="button" onClick={() => toggle(!enabled)} disabled={busy} className="lx-btn-ghost text-sm">
                {enabled ? 'Turn off online payments' : 'Turn on online payments'}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
