const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations, requireRole } = require('../middleware/auth');
const router = express.Router();
router.use(gateMutations);

// Blank form inputs arrive as '' — Postgres rejects that outright for date
// and numeric columns ("invalid input syntax for type date"), so an
// optional un-filled date would otherwise fail the whole insert.
const { blank: str, toNumber: num } = require('../utils/sanitize');

// A payment inherits the currency of the LEASE it settles — not the
// company default. Those are usually the same, but not always, and the
// difference matters: a lease agreed in USD inside a GHS portfolio must
// record USD, and if the company default were used the payment would be
// mislabelled by a factor of the exchange rate. Using the default would
// also mean that changing it later silently relabelled past payments.
const { parseCurrency, currencyForLease } = require('../utils/currency');


// GET /api/payments?tenant_id=&unit_id=&lease_id=&status=
router.get('/', async (req, res, next) => {
  try {
    const { tenant_id, unit_id, lease_id, status } = req.query;
    let query = supabase.from('l_payments').select('*').eq('company_id', req.user.company_id).order('payment_date', { ascending: false });
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
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (leaseError) throw leaseError;
    if (!lease) return res.status(404).json({ error: 'Lease not found' });

    // An explicit currency wins (a one-off settled in another currency),
    // otherwise resolve the lease's own down the inheritance chain.
    const requested = parseCurrency(currency);
    if (!requested.ok) return res.status(400).json({ error: requested.error });
    const resolvedCurrency =
      requested.value || (await currencyForLease(lease_id, req.user.company_id));

    const { data, error } = await supabase
      .from('l_payments')
      .insert({
        company_id: req.user.company_id,
        lease_id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount: num(amount),
        currency: resolvedCurrency,
        due_date: str(due_date),
        payment_date: str(payment_date),
        status: status || 'pending',
        method: str(method),
        reference: str(reference),
        notes: str(notes),
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
    const updates = { ...req.body };
    for (const f of ['due_date', 'payment_date', 'method', 'reference', 'notes']) {
      if (f in updates) updates[f] = str(updates[f]);
    }
    if ('amount' in updates) updates.amount = num(updates.amount);

    delete updates.company_id;
    const { data, error } = await supabase
      .from('l_payments')
      .update(updates)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Payment not found' });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/payments/:id — manager only. Deleting money records is
// consequential, so it sits above the finance role.
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_payments')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
