// Multi-tenant isolation, API layer: every query against a company-owned
// table must filter on the company_id carried in the caller's signed JWT —
// never a value from the body or the URL. These tests inspect the actual
// queries the fake received and assert the filter is present and equals the
// token's company, for whichever company is signed in.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

beforeEach(() => fake.reset());

function companyFilterValues(table) {
  return fake
    .callsTo(table)
    .map((c) => c.filters.find((f) => f[0] === 'eq' && f[1] === 'company_id'))
    .filter(Boolean)
    .map((f) => f[2]);
}

describe('company scoping is driven by the token', () => {
  it('GET /api/tenants filters l_tenants by the token company', async () => {
    fake.table('l_tenants', () => ({ data: [] }));
    await request(app).get('/api/tenants').set('Authorization', bearer({ company_id: 'company-A' }));

    const filters = companyFilterValues('l_tenants');
    expect(filters.length).toBeGreaterThan(0);
    expect(filters.every((v) => v === 'company-A')).toBe(true);
  });

  it('a different company sees its OWN id in the filter, never the other\'s', async () => {
    fake.table('l_tenants', () => ({ data: [] }));
    await request(app).get('/api/tenants').set('Authorization', bearer({ company_id: 'company-B' }));

    const filters = companyFilterValues('l_tenants');
    expect(filters.every((v) => v === 'company-B')).toBe(true);
    expect(filters).not.toContain('company-A');
  });

  it('GET /api/tenants/:id scopes EVERY related query (leases, payments, faults, ...) to the company', async () => {
    const co = 'company-C';
    const relatedTables = [
      'l_tenants',
      'l_leases',
      'l_payments',
      'l_faults',
      'l_tenant_tier_events',
      'l_tenant_contacts',
      'l_tenant_occupants',
      'l_tenant_vehicles',
      'l_access_credentials',
    ];
    for (const t of relatedTables) {
      fake.table(t, (ctx) => ({ data: ctx.maybeSingle ? { id: 'x', company_id: co } : [] }));
    }

    const res = await request(app).get('/api/tenants/some-tenant-id').set('Authorization', bearer({ company_id: co }));
    expect(res.status).toBe(200);

    for (const t of relatedTables) {
      const filters = companyFilterValues(t);
      expect(filters.length, `${t} should be company-scoped`).toBeGreaterThan(0);
      expect(filters.every((v) => v === co), `${t} scoped to token company`).toBe(true);
    }
  });

  it('POST /api/tenants writes the token company onto the new row (body company_id is ignored)', async () => {
    let insertedPayload = null;
    fake.table('l_tenant_id_counters', () => ({ data: null }));
    fake.table('l_subscriptions', () => ({ data: null }));
    fake.table('l_tenants', (ctx) => {
      if (ctx.method === 'insert') {
        insertedPayload = ctx.payload;
        return { data: { id: 't1', ...ctx.payload } };
      }
      return { count: 0, data: [] };
    });

    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', bearer({ company_id: 'company-D' }))
      .send({ first_name: 'Eve', last_name: 'X', company_id: 'company-EVIL' });

    expect(res.status).toBe(201);
    expect(insertedPayload.company_id).toBe('company-D'); // from the token
    expect(insertedPayload.company_id).not.toBe('company-EVIL'); // not the body
  });
});
