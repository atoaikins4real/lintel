const express = require('express');
const { supabase } = require('../config/supabase');

const router = express.Router();

/**
 * Computes a per-unit P&L: revenue in (paid payments), money out
 * (expenses + renovations + fault repair costs), occupancy rate
 * (days covered by active/completed leases vs. days since the unit
 * was created, capped to the requested window), and net yield.
 */
async function computeUnitPerformance(unit, companyId, { from, to } = {}) {
  const windowStart = from ? new Date(from) : new Date(unit.created_at);
  const windowEnd = to ? new Date(to) : new Date();
  const windowDays = Math.max(1, Math.round((windowEnd - windowStart) / (1000 * 60 * 60 * 24)));

  const [{ data: payments }, { data: expenses }, { data: renovations }, { data: faults }, { data: leases }] =
    await Promise.all([
      supabase.from('l_payments').select('*').eq('unit_id', unit.id).eq('company_id', companyId).eq('status', 'paid'),
      supabase.from('l_expenses').select('*').eq('unit_id', unit.id).eq('company_id', companyId),
      supabase.from('l_renovations').select('*').eq('unit_id', unit.id).eq('company_id', companyId),
      supabase.from('l_faults').select('*').eq('unit_id', unit.id).eq('company_id', companyId),
      supabase.from('l_leases').select('*').eq('unit_id', unit.id).eq('company_id', companyId),
    ]);

  const revenue = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  const expenseTotal = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
  const renovationTotal = (renovations || []).reduce((sum, r) => sum + Number(r.cost), 0);
  const faultCostTotal = (faults || []).reduce((sum, f) => sum + Number(f.cost || 0), 0);

  const occupiedDays = (leases || []).reduce((sum, l) => {
    if (!l.start_date) return sum;
    const start = new Date(l.start_date);
    const end = l.end_date ? new Date(l.end_date) : new Date();
    const clampedStart = start < windowStart ? windowStart : start;
    const clampedEnd = end > windowEnd ? windowEnd : end;
    const days = Math.max(0, Math.round((clampedEnd - clampedStart) / (1000 * 60 * 60 * 24)));
    return sum + days;
  }, 0);

  const occupancyRate = Math.min(100, Math.round((occupiedDays / windowDays) * 10000) / 100);
  const totalCosts = expenseTotal + renovationTotal + faultCostTotal;
  const netYield = revenue - totalCosts;

  return {
    unit_id: unit.id,
    unit_code: unit.unit_code,
    property_name: unit.property_name,
    class: unit.class,
    window_days: windowDays,
    revenue,
    expenses: expenseTotal,
    renovations: renovationTotal,
    fault_costs: faultCostTotal,
    total_costs: totalCosts,
    net_yield: netYield,
    occupancy_rate: occupancyRate,
    open_faults: (faults || []).filter((f) => f.status !== 'resolved').length,
  };
}

// GET /api/performance/units — performance summary across all units,
// sorted worst-to-best net yield so problem units surface first.
router.get('/units', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const { data: units, error } = await supabase
      .from('l_units')
      .select('*')
      .eq('company_id', req.user.company_id);
    if (error) throw error;

    const results = await Promise.all(
      units.map((u) => computeUnitPerformance(u, req.user.company_id, { from, to }))
    );
    results.sort((a, b) => a.net_yield - b.net_yield);

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /api/performance/units/:id — single unit deep dive
router.get('/units/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    const { data: unit, error } = await supabase
      .from('l_units')
      .select('*')
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const performance = await computeUnitPerformance(unit, req.user.company_id, { from, to });
    res.json(performance);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
