// Immediate session revocation. requireAuth re-reads the caller's
// session_valid_from on every request and rejects any token minted before it,
// so a demotion / move / offboarding takes effect on the next request rather
// than whenever the 7-day token expires.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { bearer, tokenFor } = require('../helpers/tokens');

beforeEach(() => fake.reset());

// A token whose iat we can control, signed like a real one.
function tokenIssuedAt(unixSeconds, over = {}) {
  return jwt.sign(
    { sub: 'user-1', email: 'u@x.test', role: 'manager', company_id: 'c1', iat: unixSeconds, ...over },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

describe('session revocation on /api/*', () => {
  it('rejects a token issued BEFORE the account cutoff (401)', async () => {
    // Cutoff is now; the token was issued an hour ago.
    const nowSec = Math.floor(Date.now() / 1000);
    fake.table('l_users', () => ({ data: { session_valid_from: new Date().toISOString() } }));
    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${tokenIssuedAt(nowSec - 3600)}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signed out|sign in again/i);
  });

  it('accepts a token issued AFTER the cutoff', async () => {
    const cutoff = new Date(Date.now() - 3600 * 1000); // an hour ago
    fake.table('l_users', () => ({ data: { session_valid_from: cutoff.toISOString() } }));
    fake.table('l_tenants', () => ({ data: [] }));
    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${tokenIssuedAt(Math.floor(Date.now() / 1000))}`);
    expect(res.status).toBe(200);
  });

  it('does not revoke a token issued in the same second as the cutoff', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    // Cutoff timestamp within the same whole second as the token's iat.
    fake.table('l_users', () => ({ data: { session_valid_from: new Date(nowSec * 1000 + 400).toISOString() } }));
    fake.table('l_tenants', () => ({ data: [] }));
    const res = await request(app)
      .get('/api/tenants')
      .set('Authorization', `Bearer ${tokenIssuedAt(nowSec)}`);
    expect(res.status).toBe(200);
  });

  it('rejects when the account no longer exists (offboarded staff)', async () => {
    fake.table('l_users', () => ({ data: null })); // row gone
    const res = await request(app).get('/api/tenants').set('Authorization', bearer({ company_id: 'c1' }));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no longer valid|sign in again/i);
  });

  it('a null cutoff never revokes', async () => {
    fake.table('l_users', () => ({ data: { session_valid_from: null } }));
    fake.table('l_tenants', () => ({ data: [] }));
    const res = await request(app).get('/api/tenants').set('Authorization', bearer({ company_id: 'c1' }));
    expect(res.status).toBe(200);
  });

  it('fails OPEN: a lookup error lets the request through (no lockout on outage)', async () => {
    fake.table('l_users', () => ({ error: { message: 'db down' } }));
    fake.table('l_tenants', () => ({ data: [] }));
    const res = await request(app).get('/api/tenants').set('Authorization', bearer({ company_id: 'c1' }));
    expect(res.status).toBe(200);
  });
});

describe('bumping the cutoff', () => {
  const manager = (over) => bearer({ role: 'manager', company_id: 'c1', id: 'mgr-1', ...over });

  it('a role change stamps session_valid_from on the target', async () => {
    let update = null;
    // requireAuth read + the count/update reads all hit l_users; branch on shape.
    fake.table('l_users', (ctx) => {
      if (ctx.method === 'update') { update = ctx.payload; return { data: { id: 'u2', role: 'finance' } }; }
      return { data: { session_valid_from: null } };
    });
    const res = await request(app)
      .patch('/api/auth/users/u2')
      .set('Authorization', manager())
      .send({ role: 'finance' });
    expect(res.status).toBe(200);
    expect(update).toHaveProperty('session_valid_from');
    expect(typeof update.session_valid_from).toBe('string');
  });

  it('a password reset stamps session_valid_from (signs out other sessions)', async () => {
    let update = null;
    fake.table('l_password_resets', (ctx) => {
      if (ctx.method === 'update') return { data: null };
      return { data: { id: 'r1', user_id: 'u9', expires_at: new Date(Date.now() + 3600e3).toISOString(), used_at: null } };
    });
    fake.table('l_users', (ctx) => {
      if (ctx.method === 'update') { update = ctx.payload; return { data: null }; }
      return { data: { session_valid_from: null } };
    });
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'raw-token', password: 'newpassword1' });
    expect(res.status).toBe(200);
    expect(update).toHaveProperty('session_valid_from');
    expect(update).toHaveProperty('password_hash');
  });
});
