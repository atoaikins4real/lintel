const { supabase } = require('../config/supabase');
const { pickCurrency, FALLBACK } = require('./currency');

/**
 * Resolves the currency for many leases at once.
 *
 * Auto-generated charges previously set no currency at all and fell back
 * to the column default, so a lease agreed in USD produced charges
 * labelled GHS every month — silently, and in a background job nobody
 * watches. The chain (lease -> unit -> property -> company default) has
 * to be honoured here exactly as it is on a manually entered payment.
 *
 * Batched deliberately: this runs nightly across every company, and three
 * extra round trips per lease would turn a quick job into a slow one.
 */
async function currenciesForLeases(leases) {
  const unitIds = [...new Set(leases.map((l) => l.unit_id).filter(Boolean))];
  const companyIds = [...new Set(leases.map((l) => l.company_id).filter(Boolean))];

  // Every read below is constrained to the companies these leases belong
  // to. The ids already come from company-scoped leases, and the composite
  // foreign keys make a cross-company reference impossible anyway — but an
  // unfiltered `.in('id', ...)` is precisely the shape audit-scoping.js
  // exists to reject, and hiding a legitimate query behind an exception
  // would blunt the check for the next person.
  const { data: units } = unitIds.length
    ? await supabase
        .from('l_units')
        .select('id, currency, property_id')
        .in('id', unitIds)
        .in('company_id', companyIds)
    : { data: [] };

  const propertyIds = [...new Set((units || []).map((u) => u.property_id).filter(Boolean))];
  const { data: properties } = propertyIds.length
    ? await supabase
        .from('l_properties')
        .select('id, currency')
        .in('id', propertyIds)
        .in('company_id', companyIds)
    : { data: [] };

  const { data: settings } = companyIds.length
    ? await supabase.from('l_settings').select('company_id, default_currency').in('company_id', companyIds)
    : { data: [] };

  const unitById = Object.fromEntries((units || []).map((u) => [u.id, u]));
  const propertyById = Object.fromEntries((properties || []).map((p) => [p.id, p]));
  const defaultByCompany = Object.fromEntries(
    (settings || []).map((s) => [s.company_id, s.default_currency || FALLBACK])
  );

  const byLease = {};
  for (const lease of leases) {
    const unit = unitById[lease.unit_id];
    const property = unit ? propertyById[unit.property_id] : null;
    byLease[lease.id] = pickCurrency(
      lease.currency,
      unit?.currency,
      property?.currency,
      defaultByCompany[lease.company_id]
    );
  }
  return byLease;
}

/**
 * The billable utilities for every unit these leases occupy, in one
 * query, keyed by unit id.
 *
 * Only active ones the tenant is actually charged for. A utility the
 * subscriber absorbs is still recorded against the apartment — it's a
 * real cost of running it — but raising it as a charge would be billing
 * the tenant for something they were never asked to pay.
 */
async function utilitiesForUnits(leases) {
  const unitIds = [...new Set(leases.map((l) => l.unit_id).filter(Boolean))];
  const companyIds = [...new Set(leases.map((l) => l.company_id).filter(Boolean))];
  if (!unitIds.length) return {};

  const { data } = await supabase
    .from('l_unit_utilities')
    .select('id, unit_id, utility_type_id, amount, billing_period, l_utility_types(name)')
    .in('unit_id', unitIds)
    .in('company_id', companyIds)
    .eq('is_active', true)
    .eq('bill_to_tenant', true);

  const byUnit = {};
  for (const row of data || []) {
    (byUnit[row.unit_id] = byUnit[row.unit_id] || []).push({
      ...row,
      name: row.l_utility_types?.name || 'Utility',
    });
  }
  return byUnit;
}

/**
 * Raises this period's charge for each utility configured on the unit,
 * as its own payment row so a tenant statement reads "Rent 12,000 /
 * Electricity 340" rather than one unexplained larger figure.
 *
 * Each utility is tracked on its own cycle: a monthly electricity charge
 * and a yearly service charge sit on the same apartment without either
 * suppressing the other.
 */
async function billUtilities({ lease, existing, utilities, currency, today, todayIso }) {
  const created = [];
  const skipped = [];

  for (const utility of utilities) {
    const amount = Number(utility.amount);
    // A utility set up but left at zero isn't a charge — raising a 0.00
    // line every month would clutter the statement to no purpose.
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const period = periodKey(today, utility.billing_period);
    const already = existing.some(
      (p) =>
        p.charge_type === 'utility' &&
        p.utility_type_id === utility.utility_type_id &&
        p.due_date &&
        periodKey(p.due_date, utility.billing_period) === period
    );
    if (already) {
      skipped.push({ lease_id: lease.id, reason: `${utility.name} already billed this period` });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('l_payments')
      .insert({
        company_id: lease.company_id,
        lease_id: lease.id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount,
        currency,
        charge_type: 'utility',
        utility_type_id: utility.utility_type_id,
        due_date: todayIso,
        status: 'pending',
        method: null,
        notes: `${utility.name} — auto-generated by billing run`,
      })
      .select()
      .single();
    if (error) throw error;
    created.push(inserted);
  }

  return { created, skipped };
}

function periodKey(date, ratePeriod) {
  const d = new Date(date);
  if (ratePeriod === 'yearly') return `${d.getFullYear()}`;
  if (ratePeriod === 'quarterly') return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  // default to monthly bucketing for 'monthly' (and as a fallback for
  // 'weekly' — weekly recurring long-stay leases are rare; they still get
  // at most one auto-generated charge per calendar month here).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Creates a pending payment for every active, long-stay lease that doesn't
// already have a payment logged for the current billing period. Short-stay
// (nightly) leases are one-off bookings and are excluded — those are paid
// at time of stay, not billed recurringly.
// `companyId` is optional: the Payments page passes the caller's company so
// the button only ever bills their own leases, while the nightly scheduled
// function omits it to bill every company in one pass. Either way each
// created payment inherits company_id from its lease, so rows are always
// attributed correctly.
async function generateCharges(companyId = null) {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  let leaseQuery = supabase
    .from('l_leases')
    .select('*')
    .eq('status', 'active')
    .eq('stay_type', 'long_stay');
  if (companyId) leaseQuery = leaseQuery.eq('company_id', companyId);

  const { data: leases, error: leaseErr } = await leaseQuery;
  if (leaseErr) throw leaseErr;

  const created = [];
  const skipped = [];

  // Resolved up front, in one batch, so each generated charge carries the
  // currency its lease is actually denominated in.
  const currencyByLease = await currenciesForLeases(leases || []);
  const utilitiesByUnit = await utilitiesForUnits(leases || []);

  for (const lease of leases) {
    if (lease.start_date && lease.start_date > todayIso) { skipped.push({ lease_id: lease.id, reason: 'not started yet' }); continue; }
    if (lease.end_date && lease.end_date < todayIso) { skipped.push({ lease_id: lease.id, reason: 'ended' }); continue; }

    const { data: existing, error: payErr } = await supabase
      .from('l_payments')
      .select('id, due_date, charge_type, utility_type_id')
      .eq('lease_id', lease.id)
      .eq('company_id', lease.company_id);
    if (payErr) throw payErr;

    // Utilities are billed alongside rent, so this check has to be
    // restricted to RENT rows. Left counting every payment, a utility
    // charge raised this month would look like rent had already been
    // billed and the rent would silently never be generated.
    const currentPeriod = periodKey(today, lease.rate_period);
    const alreadyBilled = (existing || []).some(
      (p) => p.charge_type === 'rent' && p.due_date && periodKey(p.due_date, lease.rate_period) === currentPeriod
    );

    // Utilities are billed even when the rent for this period already
    // exists — they're independent charges on their own cycles.
    const utilityResult = await billUtilities({
      lease,
      existing: existing || [],
      utilities: utilitiesByUnit[lease.unit_id] || [],
      currency: currencyByLease[lease.id],
      today,
      todayIso,
    });
    created.push(...utilityResult.created);
    skipped.push(...utilityResult.skipped);

    if (alreadyBilled) { skipped.push({ lease_id: lease.id, reason: 'already billed this period' }); continue; }

    const { data: inserted, error: insErr } = await supabase
      .from('l_payments')
      .insert({
        company_id: lease.company_id,
        lease_id: lease.id,
        tenant_id: lease.tenant_id,
        unit_id: lease.unit_id,
        amount: lease.agreed_rate,
        currency: currencyByLease[lease.id],
        charge_type: 'rent',
        due_date: todayIso,
        status: 'pending',
        method: null,
        notes: 'Auto-generated by billing run',
      })
      .select()
      .single();
    if (insErr) throw insErr;
    created.push(inserted);
  }

  return { created, skipped, generated_count: created.length };
}

// Flips any pending payment whose due_date has passed to 'late'.
// Same optional-scope rule as generateCharges above.
async function flagLatePayments(companyId = null) {
  const todayIso = new Date().toISOString().slice(0, 10);

  let findQuery = supabase
    .from('l_payments')
    .select('id')
    .eq('status', 'pending')
    .lt('due_date', todayIso);
  if (companyId) findQuery = findQuery.eq('company_id', companyId);

  const { data: overdue, error: findErr } = await findQuery;
  if (findErr) throw findErr;

  if (!overdue || overdue.length === 0) return { flagged_count: 0, ids: [] };

  const ids = overdue.map((p) => p.id);
  let updQuery = supabase.from('l_payments').update({ status: 'late' }).in('id', ids);
  if (companyId) updQuery = updQuery.eq('company_id', companyId);
  const { error: updErr } = await updQuery;
  if (updErr) throw updErr;

  return { flagged_count: ids.length, ids };
}

// Always scoped — this only ever backs a signed-in user's Payments page.
async function getBillingSummary(companyId) {
  const { data, error } = await supabase
    .from('l_payments')
    .select('amount, status')
    .eq('company_id', companyId)
    .in('status', ['pending', 'late']);
  if (error) throw error;

  const summary = { pending_count: 0, pending_total: 0, late_count: 0, late_total: 0 };
  for (const p of data) {
    if (p.status === 'pending') { summary.pending_count += 1; summary.pending_total += Number(p.amount); }
    if (p.status === 'late') { summary.late_count += 1; summary.late_total += Number(p.amount); }
  }
  return summary;
}

module.exports = { generateCharges, flagLatePayments, getBillingSummary };
