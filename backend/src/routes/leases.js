const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations, requireRole } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
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
      numbers: ['agreed_rate'],
      dates: ['start_date', 'end_date'],
      texts: ['source'],
    });

    delete updates.company_id;
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
