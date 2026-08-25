// Public auth flows: login, self-service signup, and password reset. These
// exercise the real handlers with the Supabase client faked, and pin the
// security-relevant behaviours (no account enumeration, role can't be
// self-granted, duplicate email rejected).
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

beforeEach(() => fake.reset());

describe('POST /api/auth/login', () => {
  it('rejects an unknown email with a generic 401', async () => {
    fake.table('l_users', () => ({ data: null, error: { message: 'no rows' } }));
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@x.test', password: 'whatever12' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it('rejects a wrong password with the same generic 401', async () => {
    const password_hash = await bcrypt.hash('correct-horse', 10);
    fake.table('l_users', () => ({ data: { id: 'u1', email: 'a@x.test', password_hash, role: 'manager', company_id: 'c1' } }));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.test', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it('issues a token carrying the user\'s real role and company on success', async () => {
    const password_hash = await bcrypt.hash('correct-horse', 10);
    fake.table('l_users', () => ({
      data: { id: 'u1', email: 'a@x.test', name: 'Ada', password_hash, role: 'finance', company_id: 'c1' },
    }));
    fake.table('l_companies', () => ({ data: { id: 'c1', name: 'Acme', slug: 'acme' } }));
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.test', password: 'correct-horse' });
    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded).toMatchObject({ sub: 'u1', role: 'finance', company_id: 'c1' });
  });

  it('validates that email and password are both provided', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@x.test' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/signup', () => {
  function wireNewCompanySignup() {
    fake.table('l_users', (ctx) => {
      if (ctx.method === 'insert') return { data: { id: 'new-user', email: ctx.payload.email, name: ctx.payload.name, role: ctx.payload.role, company_id: ctx.payload.company_id } };
      return { data: null }; // the duplicate-email pre-check finds nobody
    });
    fake.table('l_companies', (ctx) => {
      if (ctx.method === 'insert') return { data: { id: 'new-co', name: ctx.payload.name, slug: ctx.payload.slug } };
      return { data: null }; // uniqueSlug: slug is free
    });
    fake.table('l_settings', () => ({ data: null }));
    fake.table('l_expense_categories', () => ({ data: null }));
    fake.table('l_utility_types', () => ({ data: null }));
    fake.table('l_plans', () => ({ data: { id: 'plan-trial', trial_days: 30 } }));
    fake.table('l_subscriptions', () => ({ data: null }));
  }

  it('creates a new company workspace and returns a MANAGER token', async () => {
    wireNewCompanySignup();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'ada@x.test', password: 'longenough1', company_name: 'Ada Ltd' });
    expect(res.status).toBe(201);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.role).toBe('manager');
    expect(decoded.company_id).toBe('new-co');
  });

  it('ignores a role supplied in the signup body (cannot self-grant privilege)', async () => {
    wireNewCompanySignup();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Mallory', email: 'm@x.test', password: 'longenough1', role: 'platform_admin', is_platform_admin: true });
    expect(res.status).toBe(201);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    // Signup always makes a company MANAGER; the platform-admin flag is never
    // grantable from a request body.
    expect(decoded.role).toBe('manager');
    expect(decoded.is_platform_admin).toBe(false);
  });

  it('rejects a duplicate email before creating an orphan company (409)', async () => {
    fake.table('l_users', () => ({ data: { id: 'existing' } })); // pre-check finds an account
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'taken@x.test', password: 'longenough1' });
    expect(res.status).toBe(409);
  });

  it('rejects a too-short password (400)', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ada', email: 'ada@x.test', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('returns the same generic reply for an unknown address (no account enumeration)', async () => {
    fake.table('l_users', () => ({ data: null }));
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@x.test' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that account exists/i);
  });

  it('returns the same generic reply for a known address', async () => {
    fake.table('l_users', () => ({ data: { id: 'u1', name: 'Ada', email: 'ada@x.test' } }));
    fake.table('l_password_resets', () => ({ data: null }));
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ada@x.test' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that account exists/i);
  });
});
