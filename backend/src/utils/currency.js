// MULTI-CURRENCY
//
// A portfolio can mix currencies. Two rules hold everywhere below, and
// most of this file exists to enforce them:
//
//  1. **An amount is never converted on the way in or out of the
//     database.** Rent agreed in USD is stored as USD and shown as USD,
//     for ever. Conversion happens only when producing an *indicative*
//     roll-up for reporting, and is labelled as such.
//
//  2. **Amounts in different currencies are never added together.**
//     Summing GHS and USD into one number is not a rounding error, it is
//     a fabricated figure. Totals are therefore returned per currency.
//
// Currency is resolved down a chain, each level falling back to the one
// above it:
//
//     lease -> unit -> property -> company default
//
// NULL at any level means "inherit", not "unknown" — see the migration
// comment in db/schema.sql for why that distinction matters.

const { supabase } = require('../config/supabase');

// Codes the UI offers. Kept in step with frontend/src/utils/currency.js.
const CURRENCIES = ['GHS', 'NGN', 'USD', 'EUR', 'GBP', 'ZAR', 'KES'];

const FALLBACK = 'GHS';

/**
 * Validates a currency code from a request body.
 * Returns { ok: true, value } where value may be null (meaning inherit),
 * or { ok: false, error } for an unknown code.
 */
function parseCurrency(input) {
  if (input === undefined) return { ok: true, value: undefined }; // not being changed
  if (input === null || input === '') return { ok: true, value: null }; // explicit "inherit"
  const code = String(input).trim().toUpperCase();
  if (!CURRENCIES.includes(code)) {
    return { ok: false, error: `Currency must be one of: ${CURRENCIES.join(', ')}` };
  }
  return { ok: true, value: code };
}

/** The company's default currency and its manually-maintained rates. */
async function companyCurrency(companyId) {
  const { data } = await supabase
    .from('l_settings')
    .select('default_currency, exchange_rates')
    .eq('company_id', companyId)
    .maybeSingle();
  return {
    currency: data?.default_currency || process.env.DEFAULT_CURRENCY || FALLBACK,
    rates: data?.exchange_rates && typeof data.exchange_rates === 'object' ? data.exchange_rates : {},
  };
}

/**
 * First non-null wins. Pass the chain outermost-last:
 *   pickCurrency(lease.currency, unit.currency, property.currency, companyDefault)
 */
function pickCurrency(...levels) {
  for (const level of levels) {
    if (level) return level;
  }
  return FALLBACK;
}

/**
 * Resolves the currency a lease is denominated in by walking the chain.
 * Used when recording a payment, so the payment inherits the agreement's
 * currency rather than whatever the company default happens to be *today*
 * — otherwise changing the default later would silently relabel history.
 */
async function currencyForLease(leaseId, companyId) {
  const { currency: companyDefault } = await companyCurrency(companyId);

  const { data: lease } = await supabase
    .from('l_leases')
    .select('currency, unit_id')
    .eq('id', leaseId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!lease) return companyDefault;
  if (lease.currency) return lease.currency;

  if (!lease.unit_id) return companyDefault;
  const { data: unit } = await supabase
    .from('l_units')
    .select('currency, property_id')
    .eq('id', lease.unit_id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (unit?.currency) return unit.currency;

  if (!unit?.property_id) return companyDefault;
  const { data: property } = await supabase
    .from('l_properties')
    .select('currency')
    .eq('id', unit.property_id)
    .eq('company_id', companyId)
    .maybeSingle();

  return pickCurrency(property?.currency, companyDefault);
}

/**
 * Every unit in a company mapped to its resolved currency, in two
 * queries. Reports use this to label rows that have no currency column of
 * their own.
 *
 * Expenses, renovations and fault repair costs are all attached to a
 * unit, so they take that unit's currency rather than carrying their own.
 * That is a deliberate simplification with a real consequence: a cost
 * genuinely incurred in another currency (a boiler bought in USD for a
 * GHS building) will be labelled with the building's currency. The
 * trade-off buys something worth more day to day — a property's revenue
 * and its costs are guaranteed to be in the same currency, so its P&L is
 * always a valid subtraction rather than a mix.
 */
async function currencyByUnit(companyId) {
  const [{ data: units }, { data: properties }, { currency: companyDefault }] = await Promise.all([
    supabase.from('l_units').select('id, currency, property_id').eq('company_id', companyId),
    supabase.from('l_properties').select('id, currency').eq('company_id', companyId),
    companyCurrency(companyId),
  ]);

  const propertyById = Object.fromEntries((properties || []).map((p) => [p.id, p]));
  const map = {};
  for (const unit of units || []) {
    map[unit.id] = pickCurrency(unit.currency, propertyById[unit.property_id]?.currency, companyDefault);
  }
  map.__default = companyDefault;
  return map;
}

/**
 * Groups amounts by their own currency. Rows with no currency of their
 * own are attributed to `fallback` (the company default) rather than
 * being dropped, because a missing label means "the default one" — the
 * money is real either way.
 *
 * Returns e.g. { GHS: 42000, USD: 3500 }.
 */
function totalByCurrency(rows, { amountKey = 'amount', currencyKey = 'currency', fallback = FALLBACK } = {}) {
  const totals = {};
  for (const row of rows || []) {
    const raw = row?.[amountKey];
    // Skip absent amounts *before* coercing. Number(null) and Number('')
    // are both 0, which is finite — so without this guard a row with no
    // amount would open a bucket for its currency and the UI would
    // display "EUR 0" for a portfolio holding nothing in euros.
    if (raw === null || raw === undefined || raw === '') continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount)) continue;
    const code = row?.[currencyKey] || fallback;
    totals[code] = (totals[code] || 0) + amount;
  }
  // Round once at the end; accumulating rounded values drifts.
  for (const code of Object.keys(totals)) {
    totals[code] = Math.round(totals[code] * 100) / 100;
  }
  return totals;
}

/**
 * Converts a per-currency breakdown into a single indicative figure in
 * the company's default currency.
 *
 * Deliberately reports what it could NOT convert. Silently omitting a
 * currency with no configured rate would understate the total while
 * looking perfectly authoritative — the worst possible failure for a
 * number someone might act on. Callers must surface `missing`.
 *
 * Returns { currency, amount, complete, missing: [codes], converted: {} }
 */
function indicativeTotal(byCurrency, { defaultCurrency = FALLBACK, rates = {} } = {}) {
  let amount = 0;
  const missing = [];
  const converted = {};

  for (const [code, value] of Object.entries(byCurrency || {})) {
    if (code === defaultCurrency) {
      amount += value;
      converted[code] = value;
      continue;
    }
    const rate = Number(rates?.[code]);
    if (!Number.isFinite(rate) || rate <= 0) {
      // No usable rate — record it and leave it out of the sum.
      missing.push(code);
      continue;
    }
    const inDefault = value * rate;
    amount += inDefault;
    converted[code] = Math.round(inDefault * 100) / 100;
  }

  return {
    currency: defaultCurrency,
    amount: Math.round(amount * 100) / 100,
    // `complete` is false whenever any currency was left out, so the UI
    // can refuse to present this as a definitive figure.
    complete: missing.length === 0,
    missing,
    converted,
  };
}

/**
 * Convenience: breakdown + indicative roll-up in one call, the shape
 * every report and the dashboard return.
 */
function summariseMoney(rows, { defaultCurrency, rates, amountKey, currencyKey } = {}) {
  const by_currency = totalByCurrency(rows, {
    amountKey,
    currencyKey,
    fallback: defaultCurrency,
  });
  return {
    by_currency,
    indicative: indicativeTotal(by_currency, { defaultCurrency, rates }),
  };
}

module.exports = {
  CURRENCIES,
  FALLBACK,
  parseCurrency,
  companyCurrency,
  pickCurrency,
  currencyForLease,
  currencyByUnit,
  totalByCurrency,
  indicativeTotal,
  summariseMoney,
};
