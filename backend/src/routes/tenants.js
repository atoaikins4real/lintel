const express = require('express');
const { supabase } = require('../config/supabase');
const { generateLintelId } = require('../utils/lintelId');
const { computeScore, computeTier, isUpgradeEligible } = require('../utils/tenantScore');

const { gateMutations, requireRole } = require('../middleware/auth');
// Blank form inputs arrive as '' — store them as NULL instead, so "no
// email on file" is unambiguous. See utils/sanitize.js.
const { blank: str } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);

// Editable profile/KYC fields. Kept in one list so create and update can
// never drift apart (which is how photo_urls got silently dropped on
// unit create before).
const PROFILE_FIELDS = [
  'email',
  'phone',
  'id_document_type',
  'id_document_number',
  'id_document_expiry',
  'id_document_front_url',
  'id_document_back_url',
  'photo_url',
  'date_of_birth',
  'nationality',
  'notes',
];


// GET /api/tenants?tier=exclusive&search=kofi
router.get('/', async (req, res, next) => {
  try {
    const { tier, search } = req.query;
    let query = supabase.from('l_tenants').select('*').eq('company_id', req.user.company_id).order('created_at', { ascending: false });

    if (tier) query = query.eq('tier', tier);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,lintel_id.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/upgrade-eligible — tenants the system flags for an
// Exclusive-tier incentive offer, per the tenant lifecycle spec.
router.get('/upgrade-eligible', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('l_tenants').select('*').eq('company_id', req.user.company_id);
    if (error) throw error;

    const eligible = data.filter((t) =>
      isUpgradeEligible({
        tier: t.tier,
        score: Number(t.score),
        totalStays: t.total_stays,
        onTimePaymentRate: Number(t.on_time_payment_rate),
      })
    );

    res.json(eligible);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id — includes lease + payment + fault history
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: tenant, error } = await supabase
      .from('l_tenants')
      .select('*')
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const [{ data: leases }, { data: payments }, { data: faults }, { data: tierEvents }] =
      await Promise.all([
        supabase.from('l_leases').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id).order('start_date', { ascending: false }),
        supabase.from('l_payments').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id).order('payment_date', { ascending: false }),
        supabase.from('l_faults').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
        supabase.from('l_tenant_tier_events').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id).order('created_at', { ascending: false }),
      ]);

    // Onboarding records, so the tenant page shows the full captured
    // picture in one request.
    const [{ data: contacts }, { data: occupants }, { data: vehicles }, { data: credentials }] =
      await Promise.all([
        supabase.from('l_tenant_contacts').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
        supabase.from('l_tenant_occupants').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
        supabase.from('l_tenant_vehicles').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
        supabase.from('l_access_credentials').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
      ]);

    res.json({
      ...tenant,
      leases,
      payments,
      faults,
      tier_events: tierEvents,
      contacts: contacts || [],
      occupants: occupants || [],
      vehicles: vehicles || [],
      credentials: credentials || [],
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants — creates a tenant and assigns their permanent Lintel ID
router.post('/', async (req, res, next) => {
  try {
    const { first_name, last_name } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }

    const lintel_id = await generateLintelId(req.user.company_id);

    const payload = {
      lintel_id,
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
    };
    for (const f of PROFILE_FIELDS) payload[f] = str(req.body[f]);

    const { data, error } = await supabase
      .from('l_tenants')
      .insert({ ...payload, company_id: req.user.company_id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tenants/:id — update contact/profile fields (not score/tier)
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const updates = {};
    if (req.body.first_name !== undefined) updates.first_name = String(req.body.first_name).trim();
    if (req.body.last_name !== undefined) updates.last_name = String(req.body.last_name).trim();
    for (const f of PROFILE_FIELDS) {
      if (req.body[f] !== undefined) updates[f] = str(req.body[f]);
    }

    const { data, error } = await supabase
      .from('l_tenants')
      .update(updates)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:id/recompute — recalculates score + tier from
// this tenant's lease/payment/fault history. Call after a lease
// closes or a payment is logged.
router.post('/:id/recompute', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [{ data: leases, error: leaseErr }, { data: payments, error: payErr }, { data: faults, error: faultErr }] =
      await Promise.all([
        supabase.from('l_leases').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
        supabase.from('l_payments').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
        supabase.from('l_faults').select('*').eq('tenant_id', id).eq('company_id', req.user.company_id),
      ]);
    if (leaseErr) throw leaseErr;
    if (payErr) throw payErr;
    if (faultErr) throw faultErr;

    const totalStays = leases.length;
    const totalPaid = payments
      .filter((p) => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const paidPayments = payments.filter((p) => ['paid', 'late'].includes(p.status));
    const onTimeCount = paidPayments.filter((p) => p.status === 'paid').length;
    const onTimePaymentRate = paidPayments.length
      ? Math.round((onTimeCount / paidPayments.length) * 10000) / 100
      : 100;

    const tenantCausedFaults = faults.filter((f) => f.caused_by === 'tenant').length;

    const longStayLeases = leases.filter((l) => l.stay_type === 'long_stay');
    const longestContinuousMonths = longStayLeases.reduce((max, l) => {
      if (!l.start_date) return max;
      const start = new Date(l.start_date);
      const end = l.end_date ? new Date(l.end_date) : new Date();
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      return Math.max(max, months);
    }, 0);

    const score = computeScore({ totalStays, onTimePaymentRate, tenantCausedFaults, longestContinuousMonths });
    const tier = computeTier({ totalStays, longestContinuousMonths, score });

    const { data: currentTenant } = await supabase.from('l_tenants').select('tier').eq('id', id).eq('company_id', req.user.company_id).maybeSingle();

    const { data, error } = await supabase
      .from('l_tenants')
      .update({
        total_stays: totalStays,
        total_paid: totalPaid,
        on_time_payment_rate: onTimePaymentRate,
        score,
        tier,
      })
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (currentTenant && currentTenant.tier !== tier) {
      await supabase.from('l_tenant_tier_events').insert({
        company_id: req.user.company_id,
        tenant_id: id,
        event_type: 'tier_upgrade',
        detail: `Tier changed from ${currentTenant.tier} to ${tier} (score: ${score})`,
      });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:id/tier-events — log an incentive offer/acceptance
router.post('/:id/tier-events', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { event_type, detail } = req.body;

    if (!event_type) return res.status(400).json({ error: 'event_type is required' });

    const { data, error } = await supabase
      .from('l_tenant_tier_events')
      .insert({ company_id: req.user.company_id, tenant_id: id, event_type, detail })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tenants/:id
// Refuses while the tenant has leases or payments. Their financial
// history is the record of what happened — silently cascading it away
// because someone clicked delete would destroy the audit trail. Onboarding
// sub-records (contacts, occupants, vehicles) do cascade, since those only
// describe the tenant.
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const [{ count: leaseCount }, { count: paymentCount }] = await Promise.all([
      supabase
        .from('l_leases')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', id)
        .eq('company_id', req.user.company_id),
      supabase
        .from('l_payments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', id)
        .eq('company_id', req.user.company_id),
    ]);

    if ((leaseCount || 0) > 0 || (paymentCount || 0) > 0) {
      return res.status(409).json({
        error: `This tenant has ${leaseCount || 0} lease(s) and ${paymentCount || 0} payment(s) on record. Remove those first if you really need to delete them — their history can't be silently discarded.`,
      });
    }

    const { error } = await supabase
      .from('l_tenants')
      .delete()
      .eq('id', id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
