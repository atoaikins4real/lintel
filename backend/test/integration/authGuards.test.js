// requireAuth is the gate in front of every /api/* data route. Most of these
// cases are rejected on the token alone and never reach the database, so they
// pin the authentication contract independently of any data mocking.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { bearer, legacyTokenNoCompany } = require('../helpers/tokens');

beforeEach(() => fake.reset());

describe('requireAuth on /api/*', () => {
  it('rejects a request with no Authorization header (401)', async () => {
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not authenticated/i);
  });

  it('rejects a malformed / non-Bearer header (401)', async () => {
    const res = await request(app).get('/api/tenants').set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage bearer token (401)', async () => {
    const res = await request(app).get('/api/tenants').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('rejects a token signed with the wrong secret (401)', async () => {
    const forged = jwt.sign({ sub: 'x', company_id: 'c1', role: 'manager' }, 'attacker-secret');
    const res = await request(app).get('/api/tenants').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects a legacy pre-multi-tenancy token with no company_id, asking for re-login', async () => {
    const res = await request(app).get('/api/tenants').set('Authorization', `Bearer ${legacyTokenNoCompany()}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sign in again/i);
  });

  it('lets a valid token through to the route (which then reads the DB)', async () => {
    fake.table('l_tenants', () => ({ data: [] }));
    const res = await request(app).get('/api/tenants').set('Authorization', bearer({ company_id: 'c1' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('leaves genuinely public routes open (no token needed)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
