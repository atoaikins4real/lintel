// SECURITY DEPOSITS
//
// A deposit is money you HOLD for a tenant and owe back, less any justified
// deductions — never revenue. Each deposit carries a small ledger:
//
//   hold    the amount received when the tenancy starts
//   deduct  a charge against it (cleaning, damage, unpaid rent) with a reason
//   refund  money returned to the tenant
//
// The held balance is hold − deducts − refunds, and the status follows from
// it. Reports exclude charge_type='deposit' payments from revenue separately,
// so a deposit never inflates income.
const express = require('express');
const { supabase } = require('../config/supabase');
const { gateMutations, requireRole } = require('../middleware/auth');
const { blank: str, toNumber: num } = require('../utils/sanitize');

const router = express.Router();
router.use(gateMutations);

const round = (n) => Math.round(Number(n || 0) * 100) / 100;

// Status from the money that has moved.
function deriveStatus(amount, deducted, refunded) {
  const remaining = round(amount - deducted - refunded);
  if (remaining >= round(amount)) return 'held';
  if (remaining <= 0) return refunded > 0 ? 'returned' : 'forfeited';
  return 'partially_returned';
}

// Attach entries + computed balances to a set of deposits (one extra query).
async function withLedger(companyId, deposits) {
  const ids = deposits.map((d) => d.id);
  if (!ids.length) return [];
  const { data: entries } = await supabase
    .from('l_deposit_entries')
    .select('id, deposit_id, kind, amount, reason, created_at')
    .eq('company_id', companyId)
    .in('deposit_id', ids);

  const byDeposit = {};
  for (const e of entries || []) (byDeposit[e.deposit_id] = byDeposit[e.deposit_id] || []).push(e);

  return deposits.map((d) => {
    const es = (byDeposit[d.id] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const deducted = round(es.filter((e) => e.kind === 'deduct').reduce((s, e) => s + Number(e.amount), 0));
    const refunded = round(es.filter((e) => e.kind === 'refund').reduce((s, e) => s + Number(e.amount), 0));
    return { ...d, entries: es, deducted, refunded, balance: round(d.amount - deducted - refunded) };
  });
}

// GET /api/deposits?tenant_id=&lease_id=
router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('l_deposits')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('received_on', { ascending: false });
    if (req.query.tenant_id) q = q.eq('tenant_id', req.query.tenant_id);
    if (req.query.lease_id) q = q.eq('lease_id', req.query.lease_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(await withLedger(req.user.company_id, data || []));
  } catch (err) {
    next(err);
  }
});

// GET /api/deposits/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_deposits')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Deposit not found' });
    const [withL] = await withLedger(req.user.company_id, [data]);
    res.json(withL);
  } catch (err) {
    next(err);
  }
});

// POST /api/deposits — record a deposit received. Creates the record and its
// opening 'hold' entry together.
router.post('/', async (req, res, next) => {
  try {
    const { tenant_id, lease_id, unit_id, amount, currency, received_on, notes } = req.body;
    if (!tenant_id || !amount) return res.status(400).json({ error: 'tenant_id and amount are required' });
    const value = num(amount);
    if (!(value > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });

    const { data: deposit, error } = await supabase
      .from('l_deposits')
      .insert({
        company_id: req.user.company_id,
        tenant_id,
        lease_id: str(lease_id),
        unit_id: str(unit_id),
        amount: value,
        currency: str(currency) || 'GHS',
        status: 'held',
        received_on: str(received_on) || undefined,
        notes: str(notes),
      })
      .select()
      .single();
    if (error) throw error;

    const { error: entryErr } = await supabase.from('l_deposit_entries').insert({
      company_id: req.user.company_id,
      deposit_id: deposit.id,
      kind: 'hold',
      amount: value,
      reason: 'Deposit received',
      created_by: req.user.id,
    });
    if (entryErr) throw entryErr;

    const [withL] = await withLedger(req.user.company_id, [deposit]);
    res.status(201).json(withL);
  } catch (err) {
    next(err);
  }
});

// Shared handler for a deduction or a refund against a deposit.
function movement(kind) {
  return async (req, res, next) => {
    try {
      const value = num(req.body.amount);
      if (!(value > 0)) return res.status(400).json({ error: 'Amount must be greater than zero' });

      const { data: deposit } = await supabase
        .from('l_deposits')
        .select('*')
        .eq('id', req.params.id)
        .eq('company_id', req.user.company_id)
        .maybeSingle();
      if (!deposit) return res.status(404).json({ error: 'Deposit not found' });

      const [current] = await withLedger(req.user.company_id, [deposit]);
      if (value > current.balance + 1e-9) {
        return res.status(400).json({
          error: `Only ${deposit.currency} ${current.balance.toLocaleString()} is still held — can't ${kind} more than that.`,
        });
      }

      const { error: entryErr } = await supabase.from('l_deposit_entries').insert({
        company_id: req.user.company_id,
        deposit_id: deposit.id,
        kind,
        amount: value,
        reason: str(req.body.reason),
        created_by: req.user.id,
      });
      if (entryErr) throw entryErr;

      const deducted = round(current.deducted + (kind === 'deduct' ? value : 0));
      const refunded = round(current.refunded + (kind === 'refund' ? value : 0));
      const status = deriveStatus(deposit.amount, deducted, refunded);
      const settled = status === 'returned' || status === 'forfeited';

      await supabase
        .from('l_deposits')
        .update({ status, settled_on: settled ? new Date().toISOString().slice(0, 10) : null, updated_at: new Date().toISOString() })
        .eq('id', deposit.id)
        .eq('company_id', req.user.company_id);

      const { data: fresh } = await supabase
        .from('l_deposits')
        .select('*')
        .eq('id', deposit.id)
        .eq('company_id', req.user.company_id)
        .maybeSingle();
      const [withL] = await withLedger(req.user.company_id, [fresh]);
      res.json(withL);
    } catch (err) {
      next(err);
    }
  };
}

// POST /api/deposits/:id/deduct  { amount, reason }
router.post('/:id/deduct', movement('deduct'));
// POST /api/deposits/:id/refund  { amount, reason }
router.post('/:id/refund', movement('refund'));

// DELETE /api/deposits/:id — manager only (removes the record and its ledger).
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_deposits')
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
