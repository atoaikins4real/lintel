// Account settings: default currency, rent payout destination, and this
// account's Lintel subscription. Single-row table (see db/schema.sql) —
// there's exactly one settings record for the whole install.
//
// Read: any signed-in user (the frontend needs default_currency everywhere
// to format money). Write: manager only — payout details decide where the
// money goes, so finance/viewer deliberately can't change them.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');
const mailer = require('../utils/mailer');
const paystack = require('../utils/paystack');

const router = express.Router();

const SUPPORTED_CURRENCIES = ['GHS', 'NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES'];
const PAYOUT_METHODS = ['bank', 'mobile_money'];

function str(value) {
  if (value === '' || value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() || null : value;
}

// GET /api/settings
// Includes the company's subscription READ-ONLY. It lives in
// l_subscriptions and is writable only through /api/admin by a platform
// admin — a subscriber's own manager must not be able to mark themselves
// paid, which is exactly what the old l_settings columns allowed.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_settings')
      .select('*')
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;

    const { data: subscription } = await supabase
      .from('l_subscriptions')
      .select('status, started_on, trial_ends_on, renews_on, amount, currency, plan_id, l_plans(code, name, description, max_properties, max_units, max_staff)')
      .eq('company_id', req.user.company_id)
      .maybeSingle();

    res.json({
      ...data,
      supported_currencies: SUPPORTED_CURRENCIES,
      // `notes` on the subscription is internal to the operator and is
      // deliberately not selected above.
      subscription: subscription || null,
      // Whether a mail provider is actually configured on this server.
      //
      // With none set, the app still works but every message — including
      // password-reset links — is written to the server log instead of
      // being delivered. That fails silently and looks identical to
      // success from the browser, so someone who forgets their password
      // is simply locked out with no explanation. Surfacing it is the
      // only way anyone finds out before a user does.
      //
      // A boolean only: no provider name, no key, nothing exploitable.
      mail_configured: mailer.isConfigured,
      // Whether the PLATFORM has configured Paystack at all. If false, the
      // whole online-payments section is unavailable to every subscriber and
      // the UI hides it. Never exposes a key — a boolean only.
      online_payments_available: paystack.isConfigured(),
      // Whether THIS subscriber has finished linking a settlement account.
      online_payments_linked: Boolean(data?.paystack_subaccount_code),
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings — manager only
router.put('/', requireRole('manager'), async (req, res, next) => {
  try {
    const {
      default_currency,
      payout_method,
      payout_bank_name,
      payout_account_name,
      payout_account_number,
      payout_branch,
      payout_mobile_provider,
      payout_mobile_number,
      exchange_rates,
    } = req.body;
    // Subscription fields are deliberately NOT accepted here. They live in
    // l_subscriptions and are writable only via /api/admin by a platform
    // admin — anything a subscriber sends about their own plan or status
    // is ignored rather than trusted.

    if (default_currency && !SUPPORTED_CURRENCIES.includes(default_currency)) {
      return res.status(400).json({ error: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}` });
    }
    if (payout_method && !PAYOUT_METHODS.includes(payout_method)) {
      return res.status(400).json({ error: `Payout method must be one of: ${PAYOUT_METHODS.join(', ')}` });
    }

    // Rates back the *indicative* converted totals on the dashboard and
    // reports. They never rewrite a stored amount, so a wrong rate makes a
    // roll-up misleading but can't corrupt anything. Validated here as
    // well as by the database CHECK constraint, so the user gets a clear
    // message instead of a raw constraint violation.
    let cleanedRates;
    if (exchange_rates !== undefined) {
      if (exchange_rates === null || typeof exchange_rates !== 'object' || Array.isArray(exchange_rates)) {
        return res.status(400).json({ error: 'exchange_rates must be an object like { "USD": 15.2 }' });
      }
      const cleaned = {};
      for (const [code, value] of Object.entries(exchange_rates)) {
        const upper = String(code).trim().toUpperCase();
        if (!SUPPORTED_CURRENCIES.includes(upper)) {
          return res.status(400).json({ error: `Unknown currency in exchange rates: ${code}` });
        }
        // An empty box means "no rate set" — drop it rather than storing
        // 0, which would silently value that currency at nothing.
        if (value === '' || value === null || value === undefined) continue;
        const rate = Number(value);
        if (!Number.isFinite(rate) || rate <= 0) {
          return res.status(400).json({ error: `Exchange rate for ${upper} must be a positive number` });
        }
        cleaned[upper] = rate;
      }
      cleanedRates = cleaned;
    }

    const updates = {};
    if (cleanedRates !== undefined) updates.exchange_rates = cleanedRates;
    if (default_currency !== undefined) updates.default_currency = default_currency;
    if (payout_method !== undefined) updates.payout_method = str(payout_method);
    if (payout_bank_name !== undefined) updates.payout_bank_name = str(payout_bank_name);
    if (payout_account_name !== undefined) updates.payout_account_name = str(payout_account_name);
    if (payout_account_number !== undefined) updates.payout_account_number = str(payout_account_number);
    if (payout_branch !== undefined) updates.payout_branch = str(payout_branch);
    if (payout_mobile_provider !== undefined) updates.payout_mobile_provider = str(payout_mobile_provider);
    if (payout_mobile_number !== undefined) updates.payout_mobile_number = str(payout_mobile_number);

    const { data: existing, error: findErr } = await supabase
      .from('l_settings')
      .select('id, paystack_subaccount_code')
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: 'Settings not found for this company' });

    // The on/off switch for online payments. Turning it ON is only allowed
    // once a settlement account is linked — otherwise a tenant could tap
    // "Pay" and reach a dead end. Turning it OFF is always allowed.
    if (req.body.online_payments_enabled !== undefined) {
      const wantOn = req.body.online_payments_enabled === true || req.body.online_payments_enabled === 'true';
      if (wantOn && !existing.paystack_subaccount_code) {
        return res.status(400).json({ error: 'Link a mobile-money or bank account first, then enable online payments.' });
      }
      updates.online_payments_enabled = wantOn;
    }

    // Whether the nightly job emails tenants their rent reminders. On by
    // default; a subscriber can switch it off here.
    if (req.body.tenant_reminders_enabled !== undefined) {
      updates.tenant_reminders_enabled =
        req.body.tenant_reminders_enabled === true || req.body.tenant_reminders_enabled === 'true';
    }

    const { data, error } = await supabase
      .from('l_settings')
      .update(updates)
      .eq('id', existing.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (error) throw error;

    res.json({
      ...data,
      supported_currencies: SUPPORTED_CURRENCIES,
      online_payments_available: paystack.isConfigured(),
      online_payments_linked: Boolean(data.paystack_subaccount_code),
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// ONLINE PAYMENTS — linking a subscriber's settlement account
//
// The subscriber picks the bank or mobile-money provider that Lintel will
// settle rent into. Paystack identifies these by CODE (not name), so the UI
// fetches the list here, the subscriber selects one, and we register it as a
// Paystack subaccount. From then on a tenant's payment settles straight to
// this account — Lintel never touches the money.
// ------------------------------------------------------------

// GET /api/settings/banks?type=mobile_money|bank&currency=GHS&country=ghana
// The options for the settlement picker. Manager only (it sits alongside the
// payout details, which are manager-only). Returns [{ name, code, type }].
router.get('/banks', requireRole('manager'), async (req, res, next) => {
  try {
    if (!paystack.isConfigured()) {
      return res.status(503).json({ error: 'Online payments are not configured on this server yet.' });
    }
    const type = req.query.type === 'bank' ? undefined : 'mobile_money';
    const banks = await paystack.listBanks({
      country: req.query.country || 'ghana',
      currency: req.query.currency || undefined,
      type,
    });
    res.json(
      (banks || []).map((b) => ({ name: b.name, code: b.code, type: b.type || (type ? 'mobile_money' : 'bank') }))
    );
  } catch (err) {
    // A gateway failure here is not a server bug — report it cleanly.
    res.status(502).json({ error: err.message });
  }
});

// POST /api/settings/payments/link — manager only.
// { type, settlement_bank (code), account_number, account_name }
// Creates or updates this subscriber's Paystack subaccount and, on success,
// enables online payments. account_number is the bank account number or the
// mobile-money phone number, depending on `type`.
router.post('/payments/link', requireRole('manager'), async (req, res, next) => {
  try {
    if (!paystack.isConfigured()) {
      return res.status(503).json({ error: 'Online payments are not configured on this server yet.' });
    }
    const type = req.body.type === 'bank' ? 'bank' : 'mobile_money';
    const settlementBank = str(req.body.settlement_bank);
    const accountNumber = str(req.body.account_number);
    const accountName = str(req.body.account_name);
    if (!settlementBank || !accountNumber) {
      return res.status(400).json({ error: 'Choose a provider and enter your account (or mobile-money) number.' });
    }

    const { data: settings } = await supabase
      .from('l_settings')
      .select('id, paystack_subaccount_code')
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!settings) return res.status(404).json({ error: 'Settings not found for this company' });

    const { data: company } = await supabase
      .from('l_companies')
      .select('name, email, phone')
      .eq('id', req.user.company_id)
      .maybeSingle();
    const businessName = company?.name || accountName || 'Lintel subscriber';

    // Create the subaccount, or update the existing one in place so a
    // subscriber can correct a wrong number without orphaning the old one.
    let sub;
    try {
      if (settings.paystack_subaccount_code) {
        sub = await paystack.updateSubaccount(settings.paystack_subaccount_code, {
          businessName,
          settlementBank,
          accountNumber,
          active: true,
        });
      } else {
        sub = await paystack.createSubaccount({
          businessName,
          settlementBank,
          accountNumber,
          percentageCharge: Number(process.env.PLATFORM_FEE_PERCENT || 0),
          primaryContactEmail: company?.email || undefined,
          primaryContactPhone: company?.phone || undefined,
        });
      }
    } catch (gwErr) {
      // Paystack validates the account against the bank/provider — a wrong
      // number comes back here as a clear message for the subscriber.
      return res.status(422).json({ error: gwErr.message });
    }

    const updates = {
      paystack_subaccount_code: sub.subaccount_code || settings.paystack_subaccount_code,
      online_payments_enabled: true,
      payout_method: type === 'bank' ? 'bank' : 'mobile_money',
      payout_account_number: accountNumber,
    };
    if (accountName) updates.payout_account_name = accountName;
    if (type === 'mobile_money') updates.payout_mobile_number = accountNumber;

    const { data, error } = await supabase
      .from('l_settings')
      .update(updates)
      .eq('id', settings.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (error) throw error;

    res.json({
      ...data,
      supported_currencies: SUPPORTED_CURRENCIES,
      online_payments_available: true,
      online_payments_linked: true,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/payments/disable — manager only. Stops accepting online
// payments without discarding the linked account, so it can be turned back on
// with one tap.
router.post('/payments/disable', requireRole('manager'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_settings')
      .update({ online_payments_enabled: false })
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Settings not found for this company' });
    res.json({ ...data, supported_currencies: SUPPORTED_CURRENCIES, online_payments_available: paystack.isConfigured(), online_payments_linked: Boolean(data.paystack_subaccount_code) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
