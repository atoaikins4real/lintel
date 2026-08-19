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
      .select('id')
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!existing) return res.status(404).json({ error: 'Settings not found for this company' });

    const { data, error } = await supabase
      .from('l_settings')
      .update(updates)
      .eq('id', existing.id)
      .eq('company_id', req.user.company_id)
      .select()
      .single();
    if (error) throw error;

    res.json({ ...data, supported_currencies: SUPPORTED_CURRENCIES });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
