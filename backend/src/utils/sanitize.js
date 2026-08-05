// HTML form inputs always submit strings, and an untouched optional field
// submits ''. Postgres rejects '' outright for date, integer and numeric
// columns:
//
//   invalid input syntax for type date: ""
//   invalid input syntax for type integer: ""
//
// ...which fails the entire insert, not just that column. Every route that
// accepts optional dates/numbers from a form must run its payload through
// these before touching the database.

/** '' | null | undefined -> null; strings are trimmed. */
function blank(value) {
  if (value === '' || value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() || null : value;
}

/** '' | null | undefined | NaN -> null; otherwise a real Number. */
function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Returns a copy of `obj` with the named fields coerced. Only touches keys
 * that are actually present, so it's safe for PATCH-style partial updates.
 */
function clean(obj, { numbers = [], texts = [], dates = [] } = {}) {
  const out = { ...obj };
  for (const f of numbers) if (f in out) out[f] = toNumber(out[f]);
  for (const f of [...texts, ...dates]) if (f in out) out[f] = blank(out[f]);
  return out;
}

module.exports = { blank, toNumber, clean };
