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
