const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);


// GET /api/leases?unit_id=&tenant_id=&status=&stay_type=
router.get('/', async (req, res, next) => {
  try {
    const { unit_id, tenant_id, status, stay_type } = req.query;
    let query = supabase.from('l_leases').select('*').order('start_date', { ascending: false });
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
    const { data, error } = await supabase.from('l_leases').select('*').eq('id', id).single();
    if (error) throw error;

    const { data: payments } = await supabase.from('l_payments').select('*').eq('lease_id', id);
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

    await supabase.from('l_units').update({ status: 'occupied' }).eq('id', unit_id);

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

    const { data, error } = await supabase.from('l_leases').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // If the lease is being closed out, free up the unit.
    if (updates.status === 'completed' || updates.status === 'cancelled') {
      await supabase.from('l_units').update({ status: 'vacant' }).eq('id', data.unit_id);
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
