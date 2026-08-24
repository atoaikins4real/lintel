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
/**
 * Coerces form values for Postgres and — when given `allowed` — drops any
 * key that isn't a real column on the target table.
 *
 * The `allowed` whitelist exists because of a live bug. Detail endpoints
 * return a record plus its children: GET /properties/:id answers with the
 * property AND a `units` array. The edit page put that whole object into
 * its form and sent it all back on save, so the update tried to write a
 * `units` column that doesn't exist and Postgres rejected the request:
 *
 *     Could not find the 'units' column of 'l_properties' in the schema cache
 *
 * Nothing could save. Without `allowed` this function copies the object
 * wholesale ({ ...obj }) and coerces only the fields it was told about,
 * so every unrecognised key rides straight through to the database. The
 * same shape is latent anywhere a GET returns joined children and the
 * matching PUT accepts the body back — so the fix belongs here, once,
 * rather than in each caller stripping the one key it happens to know is
 * a problem.
 *
 * Pass the table's real columns and unknown keys are simply ignored.
 */
function clean(obj, { numbers = [], texts = [], dates = [], allowed = null } = {}) {
  const out = allowed
    ? Object.fromEntries(Object.entries(obj || {}).filter(([key]) => allowed.includes(key)))
    : { ...obj };
  for (const f of numbers) if (f in out) out[f] = toNumber(out[f]);
  for (const f of [...texts, ...dates]) if (f in out) out[f] = blank(out[f]);
  return out;
}

module.exports = { blank, toNumber, clean };
