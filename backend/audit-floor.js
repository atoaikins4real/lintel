// Audit: Lintel must only ever touch its own floor.
//
// This Supabase project is a shared building. Another application
// (Tractor) lives on the ground floor and owns ~43 tables of its own —
// `agents`, `vehicles`, `deliveries`, and notably generic names like
// `users`, `companies` and `subscriptions`. Lintel is upstairs and marks
// everything it owns with an `l_` prefix; storage buckets use `lintel-`.
//
// Why this is a script and not a note in a README: the danger isn't
// really a typo, it's the near-misses. Lintel has `l_users`,
// `l_companies` and `l_subscriptions`; Tractor has `users`, `companies`
// and `subscriptions`. Dropping the prefix on any one of those reads and
// writes another live application's production data, and nothing in
// Postgres would object — the query is perfectly valid, just aimed at the
// wrong floor. A misdirected write there wouldn't surface as a Lintel bug
// at all.
//
// Run with: npm run audit:floor
const fs = require('fs');
const path = require('path');

const TABLE_PREFIX = 'l_';
const BUCKET_PREFIX = 'lintel-';

// Supabase client methods that are NOT table access, so `.from()` here
// doesn't mean a table.
const STORAGE_CALL = /\.storage\s*\.from\(\s*'([^']+)'\s*\)/g;
const TABLE_CALL = /(?<!\.storage)\s\.from\(\s*'([^']+)'\s*\)/g;

// Bucket names are held in a constant (`const BUCKET = 'lintel-photos'`)
// and passed to .storage.from(BUCKET), so the call site has no literal to
// inspect. Checking only call sites reported "0 buckets checked" — a
// green result from a check that was examining nothing. Match the
// declaration instead.
const BUCKET_CONST = /const\s+[A-Z_]*BUCKET[A-Z_]*\s*=\s*'([^']+)'/g;

const SRC = path.join(__dirname, 'src');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
})(SRC);

let violations = 0;
let tablesChecked = 0;
let bucketsChecked = 0;

for (const file of files) {
  const rel = path.relative(__dirname, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  const lineOf = (index) => src.slice(0, index).split('\n').length;

  // Storage buckets first, so those matches aren't re-reported as tables.
  const storageMatches = new Set();
  let m;
  for (const pattern of [STORAGE_CALL, BUCKET_CONST]) {
    pattern.lastIndex = 0;
    while ((m = pattern.exec(src)) !== null) {
      storageMatches.add(m[1]);
      bucketsChecked++;
      if (!m[1].startsWith(BUCKET_PREFIX)) {
        console.log(`OFF-FLOOR  ${rel}:${lineOf(m.index)}  storage bucket '${m[1]}'`);
        console.log(`           Buckets are a shared namespace — Lintel's must start with "${BUCKET_PREFIX}".`);
        violations++;
      }
    }
  }

  while ((m = TABLE_CALL.exec(src)) !== null) {
    const table = m[1];
    if (storageMatches.has(table)) continue;

    tablesChecked++;
    if (!table.startsWith(TABLE_PREFIX)) {
      console.log(`OFF-FLOOR  ${rel}:${lineOf(m.index)}  table '${table}'`);
      console.log(
        `           Not Lintel's. Tables Lintel owns start with "${TABLE_PREFIX}" — ` +
          `'${table}' belongs to another application sharing this database.`
      );
      if (['users', 'companies', 'subscriptions', 'expenses', 'invoices'].includes(table)) {
        console.log(`           NOTE: did you mean '${TABLE_PREFIX}${table}'? Both tables exist.`);
      }
      violations++;
    }
  }
}

console.log(
  `\n${tablesChecked} table reference(s) and ${bucketsChecked} storage bucket(s) checked; ` +
    `${violations} off Lintel's floor.` + (violations ? '' : ' All on l_/lintel-.')
);
process.exit(violations === 0 ? 0 : 1);
