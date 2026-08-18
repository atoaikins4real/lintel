// Audit: every Supabase query that touches company-owned data must be
// constrained by company_id. Walks each query chain and reports any that
// isn't, so a missed filter can't quietly leak one company's data to
// another. Run with: node audit-scoping.js
const fs = require('fs');
const path = require('path');

// Tables that hold per-company business data.
const SCOPED_TABLES = [
  'l_units', 'l_tenants', 'l_leases', 'l_payments', 'l_expenses',
  'l_renovations', 'l_faults', 'l_booking_inquiries', 'l_tenant_tier_events',
  'l_settings', 'l_users', 'l_tenant_id_counters',
  'l_properties', 'l_tenant_contacts', 'l_tenant_occupants', 'l_tenant_vehicles',
  'l_access_credentials', 'l_access_events', 'l_subscriptions',
  'l_documents', 'l_tenant_portal_tokens', 'l_rent_reviews',
];

// Queries that are legitimately unscoped, with the reason. Anything not
// listed here must carry a company_id constraint.
const ALLOWED = [
  { file: 'routes/auth.js', match: "eq('email'", why: 'login/signup lookup by email happens before a session exists' },
  // Password reset runs with no session, so there is no company_id to
  // scope by. The single-use token IS the authorization: it is looked up
  // by hash and yields exactly one user_id, which this then updates. No
  // caller-supplied identifier is involved, so it cannot reach another
  // user's row.
  { file: 'routes/auth.js', match: 'record.user_id', why: 'password reset is authorised by a single-use token, not a session' },
  { file: 'utils/billing.js', match: 'companyId', why: 'optional scope: per-company from UI, all companies from the nightly job' },
  { file: 'utils/seedDemoData.js', match: 'company_id', why: 'seeds one explicit new company' },
  { file: 'routes/public.js', match: 'company.id', why: 'scoped by the company resolved from the URL slug' },
  // The platform-owner dashboard exists precisely to see across companies.
  // Every route in that file is behind requirePlatformAdmin, which
  // re-verifies the flag against the database on each request.
  { file: 'routes/admin.js', match: 'l_', why: 'platform-owner routes are cross-company by design' },
  // The tenant portal has no session. company_id comes from the token
  // record itself (record.company_id), which is looked up by hash and
  // pins the request to exactly one tenant of one company.
  { file: 'routes/tenantPortal.js', match: 'record.company_id', why: 'scoped by the company on the link token, not a session' },
  { file: 'routes/tenantPortal.js', match: "eq('email'", why: 'tenant lookup by email happens before any token exists' },
  { file: 'routes/tenantPortal.js', match: 'token_hash', why: 'token lookup is the authorisation step itself' },
  { file: 'routes/tenantPortal.js', match: 'record.id', why: 'updates the single token row just authenticated' },
  { file: 'middleware/auth.js', match: 'is_platform_admin', why: 'verifies the caller is a platform admin' },
];

const SRC = path.join(__dirname, 'src');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
})(SRC);

let total = 0;
let unscoped = 0;

for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');

  // Find each `.from('l_xxx')` and capture the chain that follows, up to
  // the statement end.
  const re = /\.from\('(l_[a-z_]+)'\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    if (!SCOPED_TABLES.includes(table)) continue;

    total++;
    const chain = src.slice(m.index, m.index + 500).split(';')[0];
    const line = src.slice(0, m.index).split('\n').length;

    // Inline scoping — the common case.
    if (/company_id/.test(chain)) continue;

    // Otherwise the query may be built up conditionally:
    //   let q = supabase.from('l_leases').select('*');
    //   if (companyId) q = q.eq('company_id', companyId);
    // Only accept that when the SAME variable is later given a
    // company_id filter. A blind character window is not good enough —
    // it happily picks up company_id from an unrelated neighbouring
    // query and reports a false pass.
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    const assign = before.match(/(?:let|const|var)\s+(\w+)\s*=\s*$|(?:let|const|var)\s+(\w+)\s*=\s*(?:await\s+)?supabase\s*$/);
    const varName = assign ? assign[1] || assign[2] : null;

    let conditionallyScoped = false;
    if (varName) {
      const after = src.slice(m.index, m.index + 900);
      const pattern = new RegExp(`${varName}\\s*=\\s*${varName}\\s*\\.eq\\(\\s*['"]company_id['"]`);
      conditionallyScoped = pattern.test(after);
    }
    if (conditionallyScoped) continue;

    const exempt = ALLOWED.find((a) => rel === a.file && chain.includes(a.match));
    if (exempt) continue;

    unscoped++;
    console.log(`UNSCOPED  ${rel}:${line}  ${table}`);
    console.log(`          ${chain.replace(/\s+/g, ' ').slice(0, 150)}`);
  }
}

console.log(`\n${total} queries against company-owned tables; ${unscoped} unscoped.`);
process.exit(unscoped === 0 ? 0 : 1);
