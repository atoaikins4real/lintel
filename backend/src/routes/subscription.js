// SELF-SERVE PLAN CHANGES (subscriber side)
//
// Subscription STATE is deliberately operator-controlled — it lives in
// l_subscriptions and only /api/admin (a platform admin) can write it, so a
// subscriber's own manager can't mark themselves paid or renewing. This
// router doesn't break that: it lets a subscriber *ask* for a plan change or
// a cancellation, recorded in l_subscription_requests. The operator applies
// or declines the request from /admin (and arranges payment, since Lintel
// doesn't move money in-app — see "A note on money movement" in the README).
//
// Mounted at /api/subscription and EXEMPT from enforceSubscription in app.js
// (like /settings), because a lapsed subscriber must still be able to see
// their plan and request an upgrade — that's precisely how they get out of
// the lapsed state. Reads are open to any signed-in user; the state-changing
// routes are manager-only.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');
const mailer = require('../utils/mailer');

const router = express.Router();

// Fields safe to expose to a subscriber choosing a plan. Deliberately no
// internal columns.
const PLAN_FIELDS = 'id, code, name, description, price, currency, billing_interval, max_properties, max_units, max_tenants, max_staff, sort_order';

// GET /api/subscription/plans — the catalogue a subscriber can pick from.
// l_plans is a global catalogue, not company-owned, so it isn't company
// scoped (and isn't in audit-scoping's SCOPED_TABLES).
router.get('/plans', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_plans')
      .select(PLAN_FIELDS)
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// GET /api/subscription/requests — this company's change requests, newest
// first. Scoped to the caller's company from the token.
router.get('/requests', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_subscription_requests')
      .select('id, kind, status, note, requested_plan_id, requested_by, decided_at, created_at, l_plans(name, price, currency, billing_interval)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/subscription/requests — manager only. Submit a plan change or
// cancellation for the operator to action.
//   body: { kind: 'change'|'cancel', requested_plan_id?, note? }
router.post('/requests', requireRole('manager'), async (req, res, next) => {
  try {
    const kind = req.body?.kind === 'cancel' ? 'cancel' : 'change';
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) || null : null;

    // The company's current subscription, so we can reject a no-op request
    // (asking to switch to the plan you're already on).
    const { data: sub } = await supabase
      .from('l_subscriptions')
      .select('plan_id, status')
      .eq('company_id', req.user.company_id)
      .maybeSingle();

    let requested_plan_id = null;
    if (kind === 'change') {
      requested_plan_id = req.body?.requested_plan_id || null;
      if (!requested_plan_id) {
        return res.status(400).json({ error: 'Choose a plan to switch to.' });
      }
      // Validate the target plan exists and is on the menu.
      const { data: plan } = await supabase
        .from('l_plans')
        .select('id, is_active, name')
        .eq('id', requested_plan_id)
        .maybeSingle();
      if (!plan || plan.is_active === false) {
        return res.status(404).json({ error: 'That plan is not available.' });
      }
      if (sub?.plan_id && sub.plan_id === requested_plan_id) {
        return res.status(400).json({ error: "You're already on that plan." });
      }
    } else if (sub?.status === 'cancelled') {
      return res.status(400).json({ error: 'Your subscription is already cancelled.' });
    }

    // One open request at a time — the DB enforces this too (partial unique
    // index), but checking here gives a clear message instead of a raw
    // constraint violation.
    const { data: pending } = await supabase
      .from('l_subscription_requests')
      .select('id')
      .eq('company_id', req.user.company_id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      return res.status(409).json({
        error: 'You already have a pending request. Withdraw it first, or wait for Lintel to action it.',
      });
    }

    const { data, error } = await supabase
      .from('l_subscription_requests')
      .insert({
        company_id: req.user.company_id,
        requested_plan_id,
        kind,
        status: 'pending',
        note,
        requested_by: req.user.id,
      })
      .select('id, kind, status, note, requested_plan_id, created_at')
      .single();
    if (error) {
      // The partial unique index fired between our check and the insert.
      if (error.code === '23505') {
        return res.status(409).json({ error: 'You already have a pending request.' });
      }
      throw error;
    }

    // Best-effort operator notification. Never throws into the request; a
    // request is recorded whether or not the email goes out.
    const { data: company } = await supabase
      .from('l_companies')
      .select('name')
      .eq('id', req.user.company_id)
      .maybeSingle();
    let planName = null;
    if (requested_plan_id) {
      const { data: plan } = await supabase.from('l_plans').select('name').eq('id', requested_plan_id).maybeSingle();
      planName = plan?.name || null;
    }
    if (mailer.templates.planChangeRequest && process.env.OPERATOR_EMAIL) {
      mailer.send({
        to: process.env.OPERATOR_EMAIL,
        ...mailer.templates.planChangeRequest({
          companyName: company?.name || 'A subscriber',
          kind,
          planName,
          note,
          appUrl: `${mailer.APP_URL}/admin`,
        }),
      });
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/subscription/requests/:id — manager only. Withdraw the
// company's own pending request. Scoped by company_id so one company can
// never touch another's. Keeps the row (status 'withdrawn') for history
// rather than hard-deleting.
router.delete('/requests/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_subscription_requests')
      .update({ status: 'withdrawn', decided_at: new Date().toISOString(), decided_by: req.user.id })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .eq('status', 'pending')
      .select('id, status')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No pending request to withdraw.' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
