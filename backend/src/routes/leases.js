const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations, requireRole } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const { parseCurrency } = require('../utils/currency');
const router = express.Router();
router.use(gateMutations);


// GET /api/leases?unit_id=&tenant_id=&status=&stay_type=
router.get('/', async (req, res, next) => {
  try {
    const { unit_id, tenant_id, status, stay_type } = req.query;
    let query = supabase.from('l_leases').select('*').eq('company_id', req.user.company_id).order('start_date', { ascending: false });
    if (unit_id) query = query.eq('unit_id', unit_id);
    if (tenant_id) query = query.eq('tenant_id', tenant_id);
    if (status) query = query.eq('status', status);
    if (stay_type) query = query.eq('stay_type', stay_type);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('l_leases').select('*').eq('id', id).eq('company_id', req.user.company_id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Lease not found' });

    const { data: payments } = await supabase.from('l_payments').select('*').eq('lease_id', id).eq('company_id', req.user.company_id);
    res.json({ ...data, payments });
  } catch (err) {
    next(err);
  }
});

// POST /api/leases — creates a lease and marks the unit occupied
router.post('/', async (req, res, next) => {
  try {
    const { tenant_id, unit_id, stay_type, start_date, end_date, agreed_rate, rate_period, source } = req.body;

    if (!tenant_id || !unit_id || !stay_type || !start_date || !agreed_rate || !rate_period) {
      return res.status(400).json({
        error: 'tenant_id, unit_id, stay_type, start_date, agreed_rate and rate_period are required',
      });
    }

    // Per-tenant currency override. Left null, the lease inherits from
    // its unit, then the property, then the company default — resolved at
    // read time, so re-denominating a property carries its leases with it.
    const currency = parseCurrency(req.body.currency);
    if (!currency.ok) return res.status(400).json({ error: currency.error });

    const { data, error } = await supabase
      .from('l_leases')
      .insert({
        company_id: req.user.company_id,
        tenant_id,
        unit_id,
        stay_type,
        start_date,
        // Open-ended long stays legitimately have no end date — '' here
        // would fail the insert against a date column.
        end_date: blank(end_date),
        agreed_rate: toNumber(agreed_rate),
        rate_period,
        source: blank(source),
        currency: currency.value === undefined ? null : currency.value,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from('l_units').update({ status: 'occupied' }).eq('id', unit_id).eq('company_id', req.user.company_id);

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = clean(req.body, {
      numbers: ['agreed_rate', 'escalation_percent'],
      dates: ['start_date', 'end_date', 'next_review_on'],
      texts: ['source'],
    });

    delete updates.company_id;

    // clean() coerces the fields it's told about but passes the rest of
    // the body through, so currency has to be validated explicitly or an
    // unrecognised code would reach the column unchecked.
    if ('currency' in updates) {
      const currency = parseCurrency(updates.currency);
      if (!currency.ok) return res.status(400).json({ error: currency.error });
      updates.currency = currency.value;
    }

    const { data, error } = await supabase
      .from('l_leases')
      .update(updates)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Lease not found' });

    // If the lease is being closed out, free up the unit — but only if
    // nothing else still occupies it. A unit can legitimately have a
    // second active lease (an overlapping short stay, or a replacement
    // signed before the old one ended), and marking it vacant then would
    // misreport an occupied property as available on the public showcase.
    if (updates.status === 'completed' || updates.status === 'cancelled') {
      await releaseUnitIfEmpty(data.unit_id, req.user.company_id);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/leases/reviews/due — leases whose rent review has arrived.
// Read-only: nothing is changed until someone applies it.
router.get('/reviews/due', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('l_leases')
      .select('*, l_tenants(first_name, last_name), l_units(unit_code, property_name)')
      .eq('company_id', req.user.company_id)
      .eq('status', 'active')
      .not('next_review_on', 'is', null)
      .lte('next_review_on', today)
      .order('next_review_on', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

// POST /api/leases/:id/apply-review
// Raises the rent by the lease's escalation percent (or an override),
// records the change, and moves the review date on a year.
//
// An explicit action rather than an automatic one — changing what a
// tenant owes shouldn't happen while nobody is looking.
router.post('/:id/apply-review', requireRole('manager', 'finance'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: lease } = await supabase
      .from('l_leases')
      .select('id, agreed_rate, escalation_percent, next_review_on')
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const percent =
      req.body.percent !== undefined && req.body.percent !== ''
        ? Number(req.body.percent)
        : Number(lease.escalation_percent);

    if (!Number.isFinite(percent)) {
      return res.status(400).json({ error: 'Set an escalation percentage on the lease, or supply one here' });
    }

    const previous = Number(lease.agreed_rate || 0);
    // Rounded to 2dp — rents are money, not floating point curiosities.
    const newRate = Math.round(previous * (1 + percent / 100) * 100) / 100;
    const effectiveOn = blank(req.body.effective_on) || new Date().toISOString().slice(0, 10);

    // Next review a year on from this one, so the cycle continues without
    // drifting if it's applied late.
    const base = lease.next_review_on ? new Date(lease.next_review_on) : new Date(effectiveOn);
    base.setFullYear(base.getFullYear() + 1);

    const { data: updated, error: updateErr } = await supabase
      .from('l_leases')
      .update({
        agreed_rate: newRate,
        last_escalated_on: effectiveOn,
        next_review_on: base.toISOString().slice(0, 10),
      })
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (updateErr) throw updateErr;

    await supabase.from('l_rent_reviews').insert({
      company_id: req.user.company_id,
      lease_id: id,
      previous_rate: previous,
      new_rate: newRate,
      percent_applied: percent,
      effective_on: effectiveOn,
      note: blank(req.body.note),
      applied_by: req.user.id,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/leases/:id/reviews — the history of increases on one lease.
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_rent_reviews')
      .select('*')
      .eq('lease_id', req.params.id)
      .eq('company_id', req.user.company_id)
      .order('effective_on', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

/**
 * Marks a unit vacant only when it has no remaining active lease.
 * Shared by the update and delete paths.
 */
async function releaseUnitIfEmpty(unitId, companyId) {
  if (!unitId) return;

  const { count, error } = await supabase
    .from('l_leases')
    .select('*', { count: 'exact', head: true })
    .eq('unit_id', unitId)
    .eq('company_id', companyId)
    .eq('status', 'active');
  if (error) throw error;

  if ((count || 0) === 0) {
    await supabase
      .from('l_units')
      .update({ status: 'vacant' })
      .eq('id', unitId)
      .eq('company_id', companyId);
  }
}

// DELETE /api/leases/:id
// Payments cascade with the lease (they're meaningless without it), so
// this refuses when money has been recorded against it — deleting a lease
// shouldn't quietly erase the payment history too.
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { count: paymentCount } = await supabase
      .from('l_payments')
      .select('*', { count: 'exact', head: true })
      .eq('lease_id', id)
      .eq('company_id', req.user.company_id);

    if ((paymentCount || 0) > 0) {
      return res.status(409).json({
        error: `This lease has ${paymentCount} payment(s) recorded against it, which would be deleted with it. Cancel the lease instead, or remove the payments first.`,
      });
    }

    const { data: lease } = await supabase
      .from('l_leases')
      .select('unit_id')
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    const { error } = await supabase
      .from('l_leases')
      .delete()
      .eq('id', id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;

    await releaseUnitIfEmpty(lease.unit_id, req.user.company_id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
