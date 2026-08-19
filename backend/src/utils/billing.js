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

function periodKey(date, ratePeriod) {
  const d = new Date(date);
  if (ratePeriod === 'yearly') return `${d.getFullYear()}`;
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

  for (const lease of leases) {
    if (lease.start_date && lease.start_date > todayIso) { skipped.push({ lease_id: lease.id, reason: 'not started yet' }); continue; }
    if (lease.end_date && lease.end_date < todayIso) { skipped.push({ lease_id: lease.id, reason: 'ended' }); continue; }

    const { data: existing, error: payErr } = await supabase
      .from('l_payments')
      .select('id, due_date')
      .eq('lease_id', lease.id)
      .eq('company_id', lease.company_id);
    if (payErr) throw payErr;

    const currentPeriod = periodKey(today, lease.rate_period);
    const alreadyBilled = (existing || []).some((p) => p.due_date && periodKey(p.due_date, lease.rate_period) === currentPeriod);

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
