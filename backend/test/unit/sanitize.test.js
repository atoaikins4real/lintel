// utils/sanitize.js turns empty HTML-form strings into NULLs so Postgres
// doesn't reject '' for date/integer/numeric columns, and (with `allowed`)
// drops keys that aren't real columns — the fix for the "units column" bug.
const { blank, toNumber, clean } = require('../../src/utils/sanitize');

describe('blank', () => {
  it('maps empty-ish values to null', () => {
    expect(blank('')).toBeNull();
    expect(blank(null)).toBeNull();
    expect(blank(undefined)).toBeNull();
    expect(blank('   ')).toBeNull(); // whitespace-only trims to empty -> null
  });

  it('trims strings but keeps real content', () => {
    expect(blank('  hello ')).toBe('hello');
  });

  it('passes non-strings straight through', () => {
    expect(blank(0)).toBe(0);
    expect(blank(false)).toBe(false);
    expect(blank(42)).toBe(42);
  });
});

describe('toNumber', () => {
  it('maps empty-ish values to null (not 0)', () => {
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });

  it('parses numeric strings', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber('0')).toBe(0);
    expect(toNumber(7)).toBe(7);
  });

  it('maps unparseable input to null rather than NaN', () => {
    expect(toNumber('abc')).toBeNull();
  });
});

describe('clean', () => {
  it('coerces named number/text/date fields on a copy', () => {
    const input = { rent: '1500', name: '  Flat A ', start: '', note: 'keep' };
    const out = clean(input, { numbers: ['rent'], texts: ['name'], dates: ['start'] });
    expect(out).toEqual({ rent: 1500, name: 'Flat A', start: null, note: 'keep' });
    expect(input.rent).toBe('1500'); // original untouched
  });

  it('only touches keys that are present (safe for PATCH-style updates)', () => {
    const out = clean({ name: 'x' }, { numbers: ['rent'], texts: ['name'] });
    expect(out).toEqual({ name: 'x' });
    expect('rent' in out).toBe(false);
  });

  it('with `allowed`, drops keys that are not real columns (the units-column bug)', () => {
    const body = { name: 'Block A', units: [{ id: 1 }], bogus: 'x', floors: '4' };
    const out = clean(body, { numbers: ['floors'], texts: ['name'], allowed: ['name', 'floors'] });
    expect(out).toEqual({ name: 'Block A', floors: 4 });
    expect('units' in out).toBe(false);
    expect('bogus' in out).toBe(false);
  });

  it('without `allowed`, unknown keys ride through (documents the latent shape)', () => {
    const out = clean({ name: 'x', units: [1] }, { texts: ['name'] });
    expect(out).toEqual({ name: 'x', units: [1] });
  });

  it('tolerates a null/undefined object', () => {
    expect(clean(null, { texts: ['name'] })).toEqual({});
    expect(clean(undefined, {})).toEqual({});
  });
});
