const express = require('express');
const { supabase } = require('../config/supabase');
const {
  companyCurrency,
  currencyByUnit,
  summariseMoney,
  indicativeTotal,
  totalByCurrency,
} = require('../utils/currency');

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

    const companyId = req.user.company_id;
    const [
      { data: payments, error: payErr },
      { data: expenses, error: expErr },
      { data: renovations, error: renoErr },
      { currency: defaultCurrency, rates },
      unitCurrency,
    ] = await Promise.all([
      supabase.from('l_payments').select('amount, currency, payment_date, status').eq('company_id', companyId).eq('status', 'paid').gte('payment_date', earliest),
      supabase.from('l_expenses').select('amount, unit_id, expense_date').eq('company_id', companyId).gte('expense_date', earliest),
      supabase.from('l_renovations').select('cost, unit_id, start_date').eq('company_id', companyId).gte('start_date', earliest),
      companyCurrency(companyId),
      currencyByUnit(companyId),
    ]);
    if (payErr) throw payErr;
    if (expErr) throw expErr;
    if (renoErr) throw renoErr;

    // A trend chart needs one comparable number per month, so unlike the
    // tables this endpoint *must* convert. It therefore tracks which
    // currencies it could not convert and returns them, so the chart can
    // be labelled honestly rather than quietly plotting a short series.
    const missingRates = new Set();
    const toDefault = (amount, code) => {
      const value = Number(amount);
      if (!Number.isFinite(value)) return 0;
      const currency = code || defaultCurrency;
      if (currency === defaultCurrency) return value;
      const rate = Number(rates?.[currency]);
      if (!Number.isFinite(rate) || rate <= 0) {
        missingRates.add(currency);
        return 0;
      }
      return value * rate;
    };

    const buckets = Object.fromEntries(keys.map((k) => [k, { month: k, revenue: 0, expenses: 0, renovations: 0 }]));

    (payments || []).forEach((p) => {
      if (!p.payment_date) return;
      const k = monthKey(p.payment_date);
      if (buckets[k]) buckets[k].revenue += toDefault(p.amount, p.currency);
    });
    (expenses || []).forEach((e) => {
      const k = monthKey(e.expense_date);
      if (buckets[k]) buckets[k].expenses += toDefault(e.amount, unitCurrency[e.unit_id]);
    });
    (renovations || []).forEach((r) => {
      if (!r.start_date) return;
      const k = monthKey(r.start_date);
      if (buckets[k]) buckets[k].renovations += toDefault(r.cost, unitCurrency[r.unit_id]);
    });

    const round = (n) => Math.round(n * 100) / 100;
    const series = keys.map((k) => {
      const b = buckets[k];
      const costs = b.expenses + b.renovations;
      return {
        month: k,
        revenue: round(b.revenue),
        expenses: round(b.expenses),
        renovations: round(b.renovations),
        costs: round(costs),
        net: round(b.revenue - costs),
      };
    });

    res.json({
      series,
      currency: defaultCurrency,
      // True whenever anything was converted, so the chart can say so.
      converted: Object.keys(rates || {}).length > 0 || missingRates.size > 0,
      missing_rates: [...missingRates],
    });
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
//
// Returns money in two forms, and the distinction is the whole point:
//
//   *_by_currency — the truth. One figure per currency, never added
//                   across currencies, always safe to quote.
//   indicative_*  — those figures converted to the company's default
//                   currency using the manually-maintained rates in
//                   Settings, purely so there's a single number to glance
//                   at. Carries `complete: false` and a `missing` list
//                   whenever a rate wasn't configured, so the UI can say
//                   so instead of quietly under-reporting.
//
// The legacy flat `revenue`/`expenses`/`costs`/`net` fields are kept so
// nothing that already reads this endpoint breaks; they now hold the
// indicative values.
router.get('/summary', async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const [
      { data: payments, error: payErr },
      { data: expenses, error: expErr },
      { data: renovations, error: renoErr },
      { currency: defaultCurrency, rates },
      unitCurrency,
    ] = await Promise.all([
      supabase.from('l_payments').select('amount, currency').eq('company_id', companyId).eq('status', 'paid'),
      supabase.from('l_expenses').select('amount, unit_id').eq('company_id', companyId),
      supabase.from('l_renovations').select('cost, unit_id').eq('company_id', companyId),
      companyCurrency(companyId),
      currencyByUnit(companyId),
    ]);
    if (payErr) throw payErr;
    if (expErr) throw expErr;
    if (renoErr) throw renoErr;

    // Costs have no currency column — they take their unit's. See
    // currencyByUnit() for why, and what that trade-off costs.
    const withUnitCurrency = (rows, amountKey) =>
      (rows || []).map((r) => ({
        amount: r[amountKey],
        currency: unitCurrency[r.unit_id] || defaultCurrency,
      }));

    const opts = { defaultCurrency, rates };
    const revenue = summariseMoney(payments || [], opts);
    const expenseTotal = summariseMoney(withUnitCurrency(expenses, 'amount'), opts);
    const renovationTotal = summariseMoney(withUnitCurrency(renovations, 'cost'), opts);

    // Costs and net are computed per currency first, so nothing is ever
    // summed across currencies on the way to the answer.
    const costsByCurrency = {};
    for (const source of [expenseTotal.by_currency, renovationTotal.by_currency]) {
      for (const [code, value] of Object.entries(source)) {
        costsByCurrency[code] = Math.round(((costsByCurrency[code] || 0) + value) * 100) / 100;
      }
    }
    const netByCurrency = {};
    for (const code of new Set([...Object.keys(revenue.by_currency), ...Object.keys(costsByCurrency)])) {
      netByCurrency[code] =
        Math.round(((revenue.by_currency[code] || 0) - (costsByCurrency[code] || 0)) * 100) / 100;
    }

    const costsIndicative = indicativeTotal(costsByCurrency, opts);
    const netIndicative = indicativeTotal(netByCurrency, opts);

    res.json({
      default_currency: defaultCurrency,

      revenue_by_currency: revenue.by_currency,
      expenses_by_currency: expenseTotal.by_currency,
      renovations_by_currency: renovationTotal.by_currency,
      costs_by_currency: costsByCurrency,
      net_by_currency: netByCurrency,

      indicative: {
        revenue: revenue.indicative,
        expenses: expenseTotal.indicative,
        renovations: renovationTotal.indicative,
        costs: costsIndicative,
        net: netIndicative,
      },

      // Back-compatible flat fields.
      revenue: revenue.indicative.amount,
      expenses: expenseTotal.indicative.amount,
      renovations: renovationTotal.indicative.amount,
      costs: costsIndicative.amount,
      net: netIndicative.amount,
    });
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

    const [{ data: properties }, { data: units }, { currency: defaultCurrency, rates }] = await Promise.all([
      supabase.from('l_properties').select('id, name, city, currency').eq('company_id', companyId),
      supabase.from('l_units').select('id, unit_code, property_id, status, currency').eq('company_id', companyId),
      companyCurrency(companyId),
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
        // A property is denominated in exactly one currency, so every
        // figure on this row — revenue and costs alike — is in it, and
        // `net` is a valid subtraction rather than a mix.
        currency: p.currency || defaultCurrency,
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
        currency: defaultCurrency,
      });
    }

    rows.sort((a, b) => b.net - a.net);

    // Portfolio totals per currency. Sorting rows by `net` above still
    // compares raw numbers across currencies, which is imprecise — but
    // it only affects display order, never a reported figure.
    const opts = { defaultCurrency, rates };
    const field = (key) => totalByCurrency(rows, { amountKey: key, fallback: defaultCurrency });
    const totalsByCurrency = {
      revenue: field('revenue'),
      expenses: field('expenses'),
      renovations: field('renovations'),
      fault_costs: field('fault_costs'),
      costs: field('costs'),
      net: field('net'),
    };

    const indicative = Object.fromEntries(
      Object.entries(totalsByCurrency).map(([key, value]) => [key, indicativeTotal(value, opts)])
    );

    res.json({
      rows,
      default_currency: defaultCurrency,
      totals_by_currency: totalsByCurrency,
      indicative,
      // Back-compatible flat totals.
      totals: Object.fromEntries(Object.entries(indicative).map(([k, v]) => [k, v.amount])),
      from: from || null,
      to: to || null,
    });
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

    const [
      { data: leases },
      { data: tenants },
      { data: units },
      { data: payments },
      { currency: defaultCurrency, rates },
      unitCurrency,
    ] = await Promise.all([
      supabase.from('l_leases').select('*').eq('company_id', companyId).eq('status', 'active'),
      supabase.from('l_tenants').select('id, lintel_id, first_name, last_name, phone, email').eq('company_id', companyId),
      supabase.from('l_units').select('id, unit_code, property_name').eq('company_id', companyId),
      supabase.from('l_payments').select('lease_id, amount, currency, status, due_date').eq('company_id', companyId),
      companyCurrency(companyId),
      currencyByUnit(companyId),
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
        // Each row states its own currency so a mixed rent roll is
        // readable line by line, not just in aggregate.
        currency: l.currency || unitCurrency[l.unit_id] || defaultCurrency,
      };
    });

    rows.sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);

    // Totals are per currency. Adding a USD rent to a GHS rent would
    // produce a number that looks authoritative and means nothing.
    const opts = { defaultCurrency, rates };
    const contracted = totalByCurrency(rows, { amountKey: 'rate', fallback: defaultCurrency });
    const outstandingTotal = totalByCurrency(rows, { amountKey: 'outstanding', fallback: defaultCurrency });
    const overdueTotal = totalByCurrency(rows, { amountKey: 'overdue', fallback: defaultCurrency });

    res.json({
      rows,
      default_currency: defaultCurrency,
      totals_by_currency: {
        contracted,
        outstanding: outstandingTotal,
        overdue: overdueTotal,
      },
      indicative: {
        contracted: indicativeTotal(contracted, opts),
        outstanding: indicativeTotal(outstandingTotal, opts),
        overdue: indicativeTotal(overdueTotal, opts),
      },
      // Back-compatible flat totals, now indicative rather than a blind sum.
      totals: {
        contracted: indicativeTotal(contracted, opts).amount,
        outstanding: indicativeTotal(outstandingTotal, opts).amount,
        overdue: indicativeTotal(overdueTotal, opts).amount,
      },
      active_leases: rows.length,
    });
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

    // These three used to be flat reduce()s over `amount`, ignoring the
    // currency each line was actually in. Harmless while a portfolio was
    // single-currency, and silently wrong the moment it wasn't — this is
    // a document handed to a tenant or an accountant, so it has to state
    // each currency separately.
    const { currency: defaultCurrency, rates } = await companyCurrency(companyId);
    const opts = { defaultCurrency, rates };
    const byCurrency = (rows) => totalByCurrency(rows, { fallback: defaultCurrency });

    const chargedByCurrency = byCurrency(lines);
    const paidByCurrency = byCurrency(lines.filter((l) => l.status === 'paid'));
    const outstandingByCurrency = byCurrency(
      lines.filter((l) => ['pending', 'late', 'partial'].includes(l.status))
    );

    const charged = indicativeTotal(chargedByCurrency, opts);
    const paid = indicativeTotal(paidByCurrency, opts);
    const outstanding = indicativeTotal(outstandingByCurrency, opts);

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
        currency: l.currency || defaultCurrency,
      })),
      lines,
      default_currency: defaultCurrency,
      totals_by_currency: {
        charged: chargedByCurrency,
        paid: paidByCurrency,
        outstanding: outstandingByCurrency,
      },
      indicative: { charged, paid, outstanding },
      // Back-compatible flat totals.
      totals: { charged: charged.amount, paid: paid.amount, outstanding: outstanding.amount },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
