// PLATFORM OWNER ROUTES
//
// The only place in Lintel that deliberately reads across companies —
// this is how the operator sees who has subscribed, what they're on, and
// who has lapsed. Every route is behind requirePlatformAdmin, which
// re-checks the flag in the database on each request (see middleware).
//
// Subscription state lives here rather than on l_settings precisely so a
// subscriber's own manager cannot edit it.
//
// NOTE for backend/audit-scoping.js: queries in this file are exempt from
// company scoping by design, and the audit's allow-list names this file
// explicitly with that reason.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requirePlatformAdmin } = require('../middleware/auth');
const { blank, toNumber } = require('../utils/sanitize');

const router = express.Router();
router.use(requirePlatformAdmin);

const STATUSES = ['trial', 'active', 'past_due', 'cancelled'];

// GET /api/admin/subscribers — every company with its plan and real usage.
router.get('/subscribers', async (req, res, next) => {
  try {
    const [{ data: companies, error: cErr }, { data: subs, error: sErr }, { data: plans, error: pErr }] =
      await Promise.all([
        supabase.from('l_companies').select('id, name, slug, email, phone, city, country, created_at'),
        supabase.from('l_subscriptions').select('*'),
        supabase.from('l_plans').select('*'),
      ]);
    if (cErr) throw cErr;
    if (sErr) throw sErr;
    if (pErr) throw pErr;

    // Usage counts, fetched once and tallied in memory rather than with a
    // query per company.
    const [{ data: users }, { data: properties }, { data: units }, { data: tenants }] = await Promise.all([
      supabase.from('l_users').select('company_id'),
      supabase.from('l_properties').select('company_id'),
      supabase.from('l_units').select('company_id'),
      supabase.from('l_tenants').select('company_id'),
    ]);

    const tally = (rows) =>
      (rows || []).reduce((acc, r) => ((acc[r.company_id] = (acc[r.company_id] || 0) + 1), acc), {});
    const userCounts = tally(users);
    const propertyCounts = tally(properties);
    const unitCounts = tally(units);
    const tenantCounts = tally(tenants);

    const subsByCompany = Object.fromEntries((subs || []).map((s) => [s.company_id, s]));
    const plansById = Object.fromEntries((plans || []).map((p) => [p.id, p]));

    const today = new Date().toISOString().slice(0, 10);

    const result = (companies || [])
      .map((c) => {
        const sub = subsByCompany[c.id] || null;
        const plan = sub?.plan_id ? plansById[sub.plan_id] : null;
        const renews = sub?.renews_on || null;
        return {
          ...c,
          subscription: sub,
          plan,
          // Computed, not stored — avoids a stale flag needing a nightly job.
          is_overdue: Boolean(renews && renews < today && sub.status === 'active'),
          days_until_renewal: renews
            ? Math.round((new Date(renews) - new Date(today)) / 86400000)
            : null,
          usage: {
            staff: userCounts[c.id] || 0,
            properties: propertyCounts[c.id] || 0,
            units: unitCounts[c.id] || 0,
            tenants: tenantCounts[c.id] || 0,
          },
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ subscribers: result, plans: plans || [] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/subscribers/:companyId/subscription
router.patch('/subscribers/:companyId/subscription', async (req, res, next) => {
  try {
    const { plan_id, status, started_on, trial_ends_on, renews_on, amount, currency, notes } = req.body;

    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
    }

    if (plan_id) {
      const { data: plan } = await supabase.from('l_plans').select('id').eq('id', plan_id).maybeSingle();
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
    }

    const updates = { updated_by: req.user.id };
    if (plan_id !== undefined) updates.plan_id = blank(plan_id);
    if (status !== undefined) updates.status = status;
    if (started_on !== undefined) updates.started_on = blank(started_on);
    if (trial_ends_on !== undefined) updates.trial_ends_on = blank(trial_ends_on);
    if (renews_on !== undefined) updates.renews_on = blank(renews_on);
    if (amount !== undefined) updates.amount = toNumber(amount);
    if (currency !== undefined) updates.currency = currency || 'GHS';
    if (notes !== undefined) updates.notes = blank(notes);

    const { data, error } = await supabase
      .from('l_subscriptions')
      .update(updates)
      .eq('company_id', req.params.companyId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Subscriber not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/plans
router.get('/plans', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('l_plans').select('*').order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/plans/:id — adjust catalogue pricing and limits.
// Existing subscribers keep their agreed `amount`, which is stored on the
// subscription rather than read from the plan.
router.put('/plans/:id', async (req, res, next) => {
  try {
    const updates = {};
    for (const f of ['name', 'description', 'currency', 'billing_interval']) {
      if (req.body[f] !== undefined) updates[f] = blank(req.body[f]);
    }
    for (const f of ['price', 'max_properties', 'max_units', 'max_staff', 'sort_order']) {
      if (req.body[f] !== undefined) updates[f] = toNumber(req.body[f]);
    }
    if (req.body.is_active !== undefined) updates.is_active = Boolean(req.body.is_active);

    const { data, error } = await supabase
      .from('l_plans')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Plan not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// SELF-SERVE PLAN CHANGE REQUESTS (operator side)
//
// Subscribers submit change/cancel requests via /api/subscription; the
// operator actions them here. Applying a request is the point at which the
// subscription STATE actually changes — keeping that in the operator's
// hands is the whole reason self-serve is a request rather than a direct
// edit (and it's where payment is arranged, since Lintel doesn't move money
// in-app). Cross-company by design, like every route in this file.
// ---------------------------------------------------------------------

// GET /api/admin/plan-requests — pending requests across all companies.
router.get('/plan-requests', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const { data: requests, error } = await supabase
      .from('l_subscription_requests')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Decorate with company and plan names, fetched in bulk.
    const companyIds = [...new Set((requests || []).map((r) => r.company_id))];
    const planIds = [...new Set((requests || []).map((r) => r.requested_plan_id).filter(Boolean))];
    const [{ data: companies }, { data: plans }, { data: subs }] = await Promise.all([
      companyIds.length ? supabase.from('l_companies').select('id, name, slug').in('id', companyIds) : Promise.resolve({ data: [] }),
      planIds.length ? supabase.from('l_plans').select('id, name, price, currency, billing_interval').in('id', planIds) : Promise.resolve({ data: [] }),
      companyIds.length ? supabase.from('l_subscriptions').select('company_id, plan_id, status, amount, currency').in('company_id', companyIds) : Promise.resolve({ data: [] }),
    ]);
    const companyById = Object.fromEntries((companies || []).map((c) => [c.id, c]));
    const planById = Object.fromEntries((plans || []).map((p) => [p.id, p]));
    const subByCompany = Object.fromEntries((subs || []).map((s) => [s.company_id, s]));

    const currentPlanIds = [...new Set(Object.values(subByCompany).map((s) => s.plan_id).filter(Boolean))];
    const { data: currentPlans } = currentPlanIds.length
      ? await supabase.from('l_plans').select('id, name').in('id', currentPlanIds)
      : { data: [] };
    const currentPlanById = Object.fromEntries((currentPlans || []).map((p) => [p.id, p]));

    const result = (requests || []).map((r) => {
      const sub = subByCompany[r.company_id];
      return {
        ...r,
        company: companyById[r.company_id] || null,
        requested_plan: r.requested_plan_id ? planById[r.requested_plan_id] || null : null,
        current: sub
          ? { status: sub.status, plan: sub.plan_id ? currentPlanById[sub.plan_id] || null : null }
          : null,
      };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/plan-requests/:id/apply — enact the request. For a
// 'change' this moves the subscription onto the requested plan and snapshots
// its price as the agreed amount (same rule as elsewhere: the amount lives
// on the subscription, not read live from the catalogue). For a 'cancel' it
// sets the subscription to cancelled. The operator can still fine-tune dates
// afterwards via the normal subscriber-management form.
router.post('/plan-requests/:id/apply', async (req, res, next) => {
  try {
    const { data: reqRow, error: reqErr } = await supabase
      .from('l_subscription_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (reqErr) throw reqErr;
    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.status !== 'pending') {
      return res.status(409).json({ error: `This request was already ${reqRow.status}.` });
    }

    const subUpdate = { updated_by: req.user.id };
    if (reqRow.kind === 'cancel') {
      subUpdate.status = 'cancelled';
    } else {
      if (!reqRow.requested_plan_id) {
        return res.status(400).json({ error: 'This change request has no plan attached.' });
      }
      const { data: plan } = await supabase
        .from('l_plans')
        .select('id, price, currency')
        .eq('id', reqRow.requested_plan_id)
        .maybeSingle();
      if (!plan) return res.status(404).json({ error: 'The requested plan no longer exists.' });
      subUpdate.plan_id = plan.id;
      subUpdate.amount = plan.price;
      subUpdate.currency = plan.currency || 'GHS';
      // A subscriber asking for a plan again means they intend to keep
      // paying — clear a cancelled status if they were in one.
      subUpdate.status = 'active';
    }

    const { data: sub, error: subErr } = await supabase
      .from('l_subscriptions')
      .update(subUpdate)
      .eq('company_id', reqRow.company_id)
      .select('*')
      .maybeSingle();
    if (subErr) throw subErr;
    if (!sub) return res.status(404).json({ error: 'That company has no subscription row to update.' });

    const { data: updated, error: updErr } = await supabase
      .from('l_subscription_requests')
      .update({ status: 'applied', decided_by: req.user.id, decided_at: new Date().toISOString() })
      .eq('id', reqRow.id)
      .select('*')
      .single();
    if (updErr) throw updErr;

    res.json({ request: updated, subscription: sub });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/plan-requests/:id/decline — reject without changing the
// subscription.
router.post('/plan-requests/:id/decline', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_subscription_requests')
      .update({ status: 'declined', decided_by: req.user.id, decided_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'No pending request with that id.' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/platform-admin — grant or revoke operator
// rights. Refuses to remove the last remaining admin, so the platform
// can't be locked out of its own administration.
router.patch('/users/:id/platform-admin', async (req, res, next) => {
  try {
    const grant = Boolean(req.body.is_platform_admin);

    if (!grant) {
      const { count, error: countErr } = await supabase
        .from('l_users')
        .select('*', { count: 'exact', head: true })
        .eq('is_platform_admin', true);
      if (countErr) throw countErr;
      if ((count || 0) <= 1) {
        return res.status(400).json({ error: 'That is the only platform admin — grant it to someone else first.' });
      }
    }

    // Bump session_valid_from so granting/revoking operator rights forces the
    // affected user's next request to re-authenticate with the new standing.
    const { data, error } = await supabase
      .from('l_users')
      .update({ is_platform_admin: grant, session_valid_from: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('id, email, name, is_platform_admin')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
