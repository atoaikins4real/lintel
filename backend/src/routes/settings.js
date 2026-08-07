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
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_settings')
      .select('*')
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;
    res.json({ ...data, supported_currencies: SUPPORTED_CURRENCIES });
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
      subscription_plan,
      subscription_status,
      subscription_started_on,
      subscription_renews_on,
      subscription_amount,
      subscription_currency,
    } = req.body;

    if (default_currency && !SUPPORTED_CURRENCIES.includes(default_currency)) {
      return res.status(400).json({ error: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}` });
    }
    if (payout_method && !PAYOUT_METHODS.includes(payout_method)) {
      return res.status(400).json({ error: `Payout method must be one of: ${PAYOUT_METHODS.join(', ')}` });
    }

    const updates = {};
    if (default_currency !== undefined) updates.default_currency = default_currency;
    if (payout_method !== undefined) updates.payout_method = str(payout_method);
    if (payout_bank_name !== undefined) updates.payout_bank_name = str(payout_bank_name);
    if (payout_account_name !== undefined) updates.payout_account_name = str(payout_account_name);
    if (payout_account_number !== undefined) updates.payout_account_number = str(payout_account_number);
    if (payout_branch !== undefined) updates.payout_branch = str(payout_branch);
    if (payout_mobile_provider !== undefined) updates.payout_mobile_provider = str(payout_mobile_provider);
    if (payout_mobile_number !== undefined) updates.payout_mobile_number = str(payout_mobile_number);
    if (subscription_plan !== undefined) updates.subscription_plan = str(subscription_plan) || 'trial';
    if (subscription_status !== undefined) updates.subscription_status = subscription_status;
    if (subscription_started_on !== undefined) updates.subscription_started_on = str(subscription_started_on);
    if (subscription_renews_on !== undefined) updates.subscription_renews_on = str(subscription_renews_on);
    if (subscription_amount !== undefined) {
      const n = Number(subscription_amount);
      updates.subscription_amount = subscription_amount === '' || Number.isNaN(n) ? null : n;
    }
    if (subscription_currency !== undefined) updates.subscription_currency = subscription_currency || 'GHS';

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
