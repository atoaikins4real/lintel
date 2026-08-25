// Pure-function tests for the multi-currency core. These enforce the two
// rules the module exists to guarantee (see utils/currency.js):
//   1. amounts are never converted on the way in/out of the database
//   2. amounts in different currencies are never summed into one number
const {
  CURRENCIES,
  FALLBACK,
  parseCurrency,
  pickCurrency,
  totalByCurrency,
  indicativeTotal,
  summariseMoney,
} = require('../../src/utils/currency');

describe('parseCurrency', () => {
  it('accepts a known code and upper-cases/trims it', () => {
    expect(parseCurrency('usd')).toEqual({ ok: true, value: 'USD' });
    expect(parseCurrency('  ghs ')).toEqual({ ok: true, value: 'GHS' });
  });

  it('treats undefined as "not being changed" and null/"" as explicit inherit', () => {
    expect(parseCurrency(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseCurrency(null)).toEqual({ ok: true, value: null });
    expect(parseCurrency('')).toEqual({ ok: true, value: null });
  });

  it('rejects an unknown code', () => {
    const r = parseCurrency('XYZ');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Currency must be one of');
  });

  it('every advertised currency parses', () => {
    for (const code of CURRENCIES) {
      expect(parseCurrency(code)).toEqual({ ok: true, value: code });
    }
  });
});

describe('pickCurrency', () => {
  it('returns the first non-null level (lease > unit > property > default)', () => {
    expect(pickCurrency('USD', 'GHS', 'EUR', 'NGN')).toBe('USD');
    expect(pickCurrency(null, 'GHS', 'EUR', 'NGN')).toBe('GHS');
    expect(pickCurrency(null, null, 'EUR', 'NGN')).toBe('EUR');
    expect(pickCurrency(undefined, null, undefined, 'NGN')).toBe('NGN');
  });

  it('falls back to GHS when every level is empty', () => {
    expect(pickCurrency(null, undefined, null)).toBe(FALLBACK);
    expect(pickCurrency()).toBe(FALLBACK);
  });
});

describe('totalByCurrency', () => {
  it('groups amounts by their own currency, never merging codes', () => {
    const rows = [
      { amount: 100, currency: 'GHS' },
      { amount: 50, currency: 'USD' },
      { amount: 25.5, currency: 'GHS' },
    ];
    expect(totalByCurrency(rows)).toEqual({ GHS: 125.5, USD: 50 });
  });

  it('attributes rows with no currency to the fallback bucket, not a dropped row', () => {
    const rows = [{ amount: 10 }, { amount: 5, currency: 'USD' }];
    expect(totalByCurrency(rows, { fallback: 'GHS' })).toEqual({ GHS: 10, USD: 5 });
  });

  it('skips absent amounts rather than opening a phantom "CUR 0" bucket', () => {
    const rows = [
      { amount: null, currency: 'EUR' },
      { amount: '', currency: 'EUR' },
      { amount: undefined, currency: 'EUR' },
      { amount: 42, currency: 'GHS' },
    ];
    expect(totalByCurrency(rows)).toEqual({ GHS: 42 });
  });

  it('ignores non-numeric amounts', () => {
    expect(totalByCurrency([{ amount: 'abc', currency: 'GHS' }])).toEqual({});
  });

  it('rounds to cents once, avoiding accumulated float drift', () => {
    const rows = [
      { amount: 0.1, currency: 'USD' },
      { amount: 0.2, currency: 'USD' },
    ];
    expect(totalByCurrency(rows)).toEqual({ USD: 0.3 });
  });

  it('handles empty / nullish input', () => {
    expect(totalByCurrency([])).toEqual({});
    expect(totalByCurrency(null)).toEqual({});
  });

  it('honours a custom amountKey/currencyKey', () => {
    const rows = [{ total: 7, cur: 'KES' }];
    expect(totalByCurrency(rows, { amountKey: 'total', currencyKey: 'cur' })).toEqual({ KES: 7 });
  });
});

describe('indicativeTotal', () => {
  it('sums the default-currency bucket as-is and converts the rest by rate', () => {
    const r = indicativeTotal({ GHS: 1000, USD: 100 }, { defaultCurrency: 'GHS', rates: { USD: 15 } });
    expect(r.currency).toBe('GHS');
    expect(r.amount).toBe(2500); // 1000 + 100*15
    expect(r.complete).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.converted).toEqual({ GHS: 1000, USD: 1500 });
  });

  it('marks the roll-up incomplete and lists what it could not convert', () => {
    const r = indicativeTotal({ GHS: 1000, USD: 100 }, { defaultCurrency: 'GHS', rates: {} });
    expect(r.amount).toBe(1000); // USD left out, not silently zero-rated into the sum
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['USD']);
  });

  it('treats a zero or negative rate as missing rather than usable', () => {
    const r = indicativeTotal({ USD: 100 }, { defaultCurrency: 'GHS', rates: { USD: 0 } });
    expect(r.missing).toEqual(['USD']);
    expect(r.amount).toBe(0);
    expect(r.complete).toBe(false);
  });

  it('a single-currency portfolio in the default currency is complete', () => {
    const r = indicativeTotal({ GHS: 500 }, { defaultCurrency: 'GHS', rates: {} });
    expect(r).toMatchObject({ amount: 500, complete: true, missing: [] });
  });
});

describe('summariseMoney', () => {
  it('returns both the per-currency breakdown and the indicative roll-up', () => {
    const rows = [
      { amount: 200, currency: 'GHS' },
      { amount: 10, currency: 'USD' },
    ];
    const out = summariseMoney(rows, { defaultCurrency: 'GHS', rates: { USD: 12 } });
    expect(out.by_currency).toEqual({ GHS: 200, USD: 10 });
    expect(out.indicative).toMatchObject({ currency: 'GHS', amount: 320, complete: true });
  });
});
