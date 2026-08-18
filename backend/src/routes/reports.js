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
        supabase.from('l_payments').select('amount, payment_date, status').eq('company_id', req.user.company_id).eq('status', 'paid').gte('payment_date', earliest),
        supabase.from('l_expenses').select('amount, expense_date').eq('company_id', req.user.company_id).gte('expense_date', earliest),
        supabase.from('l_renovations').select('cost, start_date').eq('company_id', req.user.company_id).gte('start_date', earliest),
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
      .eq('company_id', req.user.company_id)
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
        supabase.from('l_payments').select('amount').eq('company_id', req.user.company_id).eq('status', 'paid'),
        supabase.from('l_expenses').select('amount').eq('company_id', req.user.company_id),
        supabase.from('l_renovations').select('cost').eq('company_id', req.user.company_id),
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

// ---------------------------------------------------------------------
// PROFIT & LOSS PER PROPERTY
//
// Revenue is PAID payments only — pending and late amounts are owed, not
// earned, and counting them would overstate performance. Costs are
// expenses + renovations + fault repair costs. Both sides are attributed
// through the unit to its parent property.
// ---------------------------------------------------------------------
router.get('/property-pnl', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const companyId = req.user.company_id;

    const [{ data: properties }, { data: units }] = await Promise.all([
      supabase.from('l_properties').select('id, name, city').eq('company_id', companyId),
      supabase.from('l_units').select('id, unit_code, property_id, status').eq('company_id', companyId),
    ]);

    // Date range applied against the column that means "when this
    // actually happened" for each table. company_id is filtered inline on
    // every query rather than in a helper — hiding it behind a function
    // would also hide a genuinely missing filter from audit-scoping.js.
    const dateRange = (q, column) => {
      let out = q;
      if (from) out = out.gte(column, from);
      if (to) out = out.lte(column, to);
      return out;
    };

    const [{ data: payments }, { data: expenses }, { data: renovations }, { data: faults }] =
      await Promise.all([
        dateRange(
          supabase
            .from('l_payments')
            .select('unit_id, amount, status, payment_date')
            .eq('company_id', companyId)
            .eq('status', 'paid'),
          'payment_date'
        ),
        dateRange(
          supabase.from('l_expenses').select('unit_id, amount, expense_date').eq('company_id', companyId),
          'expense_date'
        ),
        dateRange(
          supabase.from('l_renovations').select('unit_id, cost, start_date').eq('company_id', companyId),
          'start_date'
        ),
        dateRange(
          supabase.from('l_faults').select('unit_id, cost, reported_date').eq('company_id', companyId),
          'reported_date'
        ),
      ]);

    const unitToProperty = Object.fromEntries((units || []).map((u) => [u.id, u.property_id]));
    const blank = () => ({ revenue: 0, expenses: 0, renovations: 0, fault_costs: 0 });
    const buckets = {};
    const bucketFor = (unitId) => {
      const pid = unitToProperty[unitId] || 'unassigned';
      buckets[pid] = buckets[pid] || blank();
      return buckets[pid];
    };

    (payments || []).forEach((p) => (bucketFor(p.unit_id).revenue += Number(p.amount || 0)));
    (expenses || []).forEach((e) => (bucketFor(e.unit_id).expenses += Number(e.amount || 0)));
    (renovations || []).forEach((r) => (bucketFor(r.unit_id).renovations += Number(r.cost || 0)));
    (faults || []).forEach((f) => (bucketFor(f.unit_id).fault_costs += Number(f.cost || 0)));

    const rows = (properties || []).map((p) => {
      const b = buckets[p.id] || blank();
      const propertyUnits = (units || []).filter((u) => u.property_id === p.id);
      const costs = b.expenses + b.renovations + b.fault_costs;
      return {
        property_id: p.id,
        property_name: p.name,
        city: p.city,
        units: propertyUnits.length,
        occupied: propertyUnits.filter((u) => u.status === 'occupied').length,
        ...b,
        costs,
        net: b.revenue - costs,
        // Guarded against divide-by-zero for a property with no revenue.
        margin_pct: b.revenue > 0 ? Math.round(((b.revenue - costs) / b.revenue) * 1000) / 10 : null,
      };
    });

    // Units not yet attached to a property still have money against them;
    // surfacing it separately avoids silently losing figures.
    if (buckets.unassigned) {
      const b = buckets.unassigned;
      const costs = b.expenses + b.renovations + b.fault_costs;
      rows.push({
        property_id: null,
        property_name: 'Unassigned units',
        city: null,
        units: (units || []).filter((u) => !u.property_id).length,
        occupied: 0,
        ...b,
        costs,
        net: b.revenue - costs,
        margin_pct: b.revenue > 0 ? Math.round(((b.revenue - costs) / b.revenue) * 1000) / 10 : null,
      });
    }

    rows.sort((a, b) => b.net - a.net);

    const totals = rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenue;
        acc.expenses += r.expenses;
        acc.renovations += r.renovations;
        acc.fault_costs += r.fault_costs;
        acc.costs += r.costs;
        acc.net += r.net;
        return acc;
      },
      { revenue: 0, expenses: 0, renovations: 0, fault_costs: 0, costs: 0, net: 0 }
    );

    res.json({ rows, totals, from: from || null, to: to || null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// RENT ROLL — what should be coming in, and what's outstanding.
// ---------------------------------------------------------------------
router.get('/rent-roll', async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: leases }, { data: tenants }, { data: units }, { data: payments }] = await Promise.all([
      supabase.from('l_leases').select('*').eq('company_id', companyId).eq('status', 'active'),
      supabase.from('l_tenants').select('id, lintel_id, first_name, last_name, phone, email').eq('company_id', companyId),
      supabase.from('l_units').select('id, unit_code, property_name').eq('company_id', companyId),
      supabase.from('l_payments').select('lease_id, amount, status, due_date').eq('company_id', companyId),
    ]);

    const tenantById = Object.fromEntries((tenants || []).map((t) => [t.id, t]));
    const unitById = Object.fromEntries((units || []).map((u) => [u.id, u]));

    const rows = (leases || []).map((l) => {
      const leasePayments = (payments || []).filter((p) => p.lease_id === l.id);
      const outstanding = leasePayments
        .filter((p) => ['pending', 'late', 'partial'].includes(p.status))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const overdue = leasePayments
        .filter((p) => ['pending', 'late'].includes(p.status) && p.due_date && p.due_date < today)
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const t = tenantById[l.tenant_id];
      const u = unitById[l.unit_id];

      return {
        lease_id: l.id,
        tenant: t ? `${t.first_name} ${t.last_name}` : '—',
        lintel_id: t?.lintel_id || null,
        contact: [t?.phone, t?.email].filter(Boolean).join(' · ') || null,
        unit: u?.unit_code || '—',
        property: u?.property_name || '—',
        stay_type: l.stay_type,
        rate: Number(l.agreed_rate || 0),
        rate_period: l.rate_period,
        start_date: l.start_date,
        end_date: l.end_date,
        outstanding,
        overdue,
      };
    });

    rows.sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);

    const totals = rows.reduce(
      (acc, r) => {
        acc.contracted += r.rate;
        acc.outstanding += r.outstanding;
        acc.overdue += r.overdue;
        return acc;
      },
      { contracted: 0, outstanding: 0, overdue: 0 }
    );

    res.json({ rows, totals, active_leases: rows.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// TENANT STATEMENT — a full ledger for one tenant, in the form you'd
// hand to them or to an accountant.
// ---------------------------------------------------------------------
router.get('/tenant-statement/:tenantId', async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const { tenantId } = req.params;

    const { data: tenant } = await supabase
      .from('l_tenants')
      .select('*')
      .eq('id', tenantId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const [{ data: leases }, { data: payments }, { data: units }, { data: company }] = await Promise.all([
      supabase.from('l_leases').select('*').eq('tenant_id', tenantId).eq('company_id', companyId),
      supabase
        .from('l_payments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .order('due_date', { ascending: true }),
      supabase.from('l_units').select('id, unit_code, property_name').eq('company_id', companyId),
      supabase.from('l_companies').select('name, email, phone, address, city, country').eq('id', companyId).maybeSingle(),
    ]);

    const unitById = Object.fromEntries((units || []).map((u) => [u.id, u]));

    const lines = (payments || []).map((p) => ({
      date: p.payment_date || p.due_date,
      due_date: p.due_date,
      payment_date: p.payment_date,
      description: `${unitById[p.unit_id]?.unit_code || 'Unit'} — ${p.notes || 'Rent'}`,
      amount: Number(p.amount || 0),
      currency: p.currency,
      status: p.status,
      method: p.method,
      reference: p.reference,
    }));

    const charged = lines.reduce((s, l) => s + l.amount, 0);
    const paid = lines.filter((l) => l.status === 'paid').reduce((s, l) => s + l.amount, 0);
    const outstanding = lines
      .filter((l) => ['pending', 'late', 'partial'].includes(l.status))
      .reduce((s, l) => s + l.amount, 0);

    res.json({
      company,
      tenant: {
        id: tenant.id,
        lintel_id: tenant.lintel_id,
        name: `${tenant.first_name} ${tenant.last_name}`,
        email: tenant.email,
        phone: tenant.phone,
      },
      leases: (leases || []).map((l) => ({
        unit: unitById[l.unit_id]?.unit_code || '—',
        property: unitById[l.unit_id]?.property_name || '—',
        stay_type: l.stay_type,
        start_date: l.start_date,
        end_date: l.end_date,
        rate: Number(l.agreed_rate || 0),
        rate_period: l.rate_period,
        status: l.status,
      })),
      lines,
      totals: { charged, paid, outstanding },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
