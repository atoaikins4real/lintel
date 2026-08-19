// Money formatting. Every amount in Lintel carries its own currency (each
// payment row stores one), falling back to the account's default currency
// from Settings — so a portfolio can mix currencies without amounts ever
// being mislabelled.

export const CURRENCY_LABELS = {
  GHS: 'Ghana Cedi (GHS)',
  NGN: 'Nigerian Naira (NGN)',
  USD: 'US Dollar (USD)',
  EUR: 'Euro (EUR)',
  GBP: 'British Pound (GBP)',
  ZAR: 'South African Rand (ZAR)',
  KES: 'Kenyan Shilling (KES)',
};

export const CURRENCY_CODES = Object.keys(CURRENCY_LABELS);

/**
 * Renders a per-currency breakdown as one string:
 *   { GHS: 42000, USD: 3500 } -> "GHS 42,000 · USD 3,500"
 *
 * Deliberately has no single-number mode. Adding a GHS figure to a USD
 * figure produces something that looks like a total and isn't one, so the
 * breakdown is the only truthful way to show mixed money — the converted
 * roll-up is shown separately and labelled as an estimate.
 */
export function formatMoneyBreakdown(byCurrency, { decimals = 0, empty = '—' } = {}) {
  const entries = Object.entries(byCurrency || {});
  if (entries.length === 0) return empty;
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => formatMoney(amount, code, { decimals }))
    .join('  ·  ');
}

/** True when a breakdown spans more than one currency. */
export function isMixed(byCurrency) {
  return Object.keys(byCurrency || {}).length > 1;
}

export function formatMoney(amount, currency = 'GHS', { decimals = 0 } = {}) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return '—';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    // Unknown/unsupported currency code — still show something sensible
    // rather than throwing inside a render.
    return `${currency} ${n.toLocaleString()}`;
  }
}
