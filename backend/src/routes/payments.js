const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const router = express.Router();
router.use(gateMutations);


// GET /api/payments?tenant_id=&unit_id=&lease_id=&status=
router.get('/', async (req, res, next) => {
  try {
    const { tenant_id, unit_id, lease_id, status } = req.query;
    let query = supabase.from('l_payments').select('*').order('payment_date', { ascending: false });
    if (tenant_id) query = query.eq('tenant_id', tenant_id);
    if (unit_id) query = query.eq('unit_id', unit_id);
    if (lease_id) query = query.eq('lease_id', lease_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/payments — logs a payment against a lease
router.post('/', async (req, res, next) => {
  try {
    const { lease_id, amount, currency, due_date, payment_date, status, method, reference, notes } = req.body;

    if (!lease_id || !amount) {
      return res.status(400).json({ error: 'lease_id and amount are required' });
    }

    const { data: lease, error: leaseError } = await supabase
      .from('l_leases')
      .select('tenant_id, unit_id')
      .eq('id', lease_id)
      .single();
    if (leaseError) throw leaseError;

    const { data, error } = await supabase
      .from('l_payments')
      .insert({
        lease_id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount,
        currency: currency || process.env.DEFAULT_CURRENCY || 'GHS',
        due_date,
        payment_date,
        status: status || 'pending',
        method,
        reference,
        notes,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('l_payments').update(req.body).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
