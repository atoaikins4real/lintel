// Role enforcement. Reads are open to any authenticated user; writes require
// manager or finance (gateMutations). This is enforced server-side, not just
// hidden in the UI — a viewer's POST must be refused with 403.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

beforeEach(() => {
  fake.reset();
  // No subscription row => enforceSubscription treats standing as OK, so these
  // tests isolate the role check rather than tripping the subscription gate.
  fake.table('l_subscriptions', () => ({ data: null }));
});

describe('write gating by role (POST /api/faults)', () => {
  it('refuses a viewer with 403', async () => {
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', bearer({ role: 'viewer', company_id: 'c1' }))
      .send({ unit_id: 'u1', description: 'Leak' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/requires role/i);
  });

  it('allows a manager through the gate to the handler', async () => {
    fake.table('l_faults', (ctx) => ({ data: ctx.method === 'insert' ? { id: 'f1', ...ctx.payload } : [] }));
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', bearer({ role: 'manager', company_id: 'c1' }))
      .send({ unit_id: 'u1', description: 'Leak' });
    expect([200, 201]).toContain(res.status);
  });

  it('allows a finance user to write', async () => {
    fake.table('l_faults', (ctx) => ({ data: ctx.method === 'insert' ? { id: 'f2', ...ctx.payload } : [] }));
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', bearer({ role: 'finance', company_id: 'c1' }))
      .send({ unit_id: 'u1', description: 'Broken lock' });
    expect([200, 201]).toContain(res.status);
  });

  it('lets a viewer READ (GET is never gated by role)', async () => {
    fake.table('l_faults', () => ({ data: [] }));
    const res = await request(app)
      .get('/api/faults')
      .set('Authorization', bearer({ role: 'viewer', company_id: 'c1' }));
    expect(res.status).toBe(200);
  });
});

describe('platform-admin gate (/api/admin)', () => {
  it('returns 404 (not 403) to a non-admin, so the admin area is not advertised', async () => {
    const res = await request(app)
      .get('/api/admin/subscribers')
      .set('Authorization', bearer({ role: 'manager', is_platform_admin: false, company_id: 'c1' }));
    expect(res.status).toBe(404);
  });

  it('re-checks the flag in the DB even for a token that claims admin', async () => {
    // Token says admin, but the database says no -> still 404. This is the
    // "revoke takes effect immediately" guarantee.
    fake.table('l_users', () => ({ data: { is_platform_admin: false } }));
    const res = await request(app)
      .get('/api/admin/subscribers')
      .set('Authorization', bearer({ role: 'manager', is_platform_admin: true, company_id: 'c1' }));
    expect(res.status).toBe(404);
  });
});
