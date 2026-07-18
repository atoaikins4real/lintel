const express = require('express');
const { supabase } = require('../config/supabase');

const router = express.Router();

function monthKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function lastNMonthKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

// GET /api/reports/monthly?months=6 — revenue (paid payments) vs costs
// (expenses + renovations), bucketed by calendar month, portfolio-wide.
router.get('/monthly', async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));
    const keys = lastNMonthKeys(months);
    const earliest = `${keys[0]}-01`;

    const [{ data: payments, error: payErr }, { data: expenses, error: expErr }, { data: renovations, error: renoErr }] =
      await Promise.all([
        supabase.from('l_payments').select('amount, payment_date, status').eq('status', 'paid').gte('payment_date', earliest),
        supabase.from('l_expenses').select('amount, expense_date').gte('expense_date', earliest),
        supabase.from('l_renovations').select('cost, start_date').gte('start_date', earliest),
      ]);
    if (payErr) throw payErr;
    if (expErr) throw expErr;
    if (renoErr) throw renoErr;

    const buckets = Object.fromEntries(keys.map((k) => [k, { month: k, revenue: 0, expenses: 0, renovations: 0 }]));

    (payments || []).forEach((p) => {
      if (!p.payment_date) return;
      const k = monthKey(p.payment_date);
      if (buckets[k]) buckets[k].revenue += Number(p.amount);
    });
    (expenses || []).forEach((e) => {
      const k = monthKey(e.expense_date);
      if (buckets[k]) buckets[k].expenses += Number(e.amount);
    });
    (renovations || []).forEach((r) => {
      if (!r.start_date) return;
      const k = monthKey(r.start_date);
      if (buckets[k]) buckets[k].renovations += Number(r.cost);
    });

    const series = keys.map((k) => {
      const b = buckets[k];
      const costs = b.expenses + b.renovations;
      return { ...b, costs, net: b.revenue - costs };
    });

    res.json(series);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/expense-breakdown?months=6 — totals by category
router.get('/expense-breakdown', async (req, res, next) => {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));
    const keys = lastNMonthKeys(months);
    const earliest = `${keys[0]}-01`;

    const { data: expenses, error } = await supabase
      .from('l_expenses')
      .select('amount, category')
      .gte('expense_date', earliest);
    if (error) throw error;

    const totals = {};
    (expenses || []).forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + Number(e.amount);
    });

    const breakdown = Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    res.json(breakdown);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/summary — all-time portfolio totals
router.get('/summary', async (req, res, next) => {
  try {
    const [{ data: payments, error: payErr }, { data: expenses, error: expErr }, { data: renovations, error: renoErr }] =
      await Promise.all([
        supabase.from('l_payments').select('amount').eq('status', 'paid'),
        supabase.from('l_expenses').select('amount'),
        supabase.from('l_renovations').select('cost'),
      ]);
    if (payErr) throw payErr;
    if (expErr) throw expErr;
    if (renoErr) throw renoErr;

    const revenue = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
    const expenseTotal = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);
    const renovationTotal = (renovations || []).reduce((s, r) => s + Number(r.cost), 0);
    const costs = expenseTotal + renovationTotal;

    res.json({ revenue, expenses: expenseTotal, renovations: renovationTotal, costs, net: revenue - costs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
