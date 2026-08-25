// Subscription enforcement as degradation, not lockout: reads always work,
// writes are refused once a subscription is past its grace period, and the
// check fails OPEN (a lookup error must never take an account down).
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

beforeEach(() => fake.reset());

const manager = () => bearer({ role: 'manager', company_id: 'c1' });

describe('enforceSubscription on writes', () => {
  it('blocks a write with 402 when the trial has expired past grace', async () => {
    fake.table('l_subscriptions', () => ({
      data: { status: 'trial', trial_ends_on: '2000-01-01', renews_on: null },
    }));
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', manager())
      .send({ unit_id: 'u1', description: 'x' });
    expect(res.status).toBe(402);
    expect(res.body.read_only).toBe(true);
    expect(res.body.subscription_state).toBe('trial_expired');
  });

  it('allows a write while within the grace period', async () => {
    // renews_on a few days ago => grace => writable.
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    fake.table('l_subscriptions', () => ({ data: { status: 'active', renews_on: threeDaysAgo } }));
    fake.table('l_faults', (ctx) => ({ data: ctx.method === 'insert' ? { id: 'f1', ...ctx.payload } : [] }));
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', manager())
      .send({ unit_id: 'u1', description: 'x' });
    expect([200, 201]).toContain(res.status);
  });

  it('NEVER blocks a read, even for a long-lapsed subscription', async () => {
    fake.table('l_subscriptions', () => ({
      data: { status: 'active', renews_on: '2000-01-01' },
    }));
    fake.table('l_faults', () => ({ data: [] }));
    const res = await request(app).get('/api/faults').set('Authorization', manager());
    expect(res.status).toBe(200);
  });

  it('fails OPEN: a subscription-lookup error lets the write proceed', async () => {
    fake.table('l_subscriptions', () => ({ error: { message: 'db exploded' } }));
    fake.table('l_faults', (ctx) => ({ data: ctx.method === 'insert' ? { id: 'f9', ...ctx.payload } : [] }));
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', manager())
      .send({ unit_id: 'u1', description: 'x' });
    expect([200, 201]).toContain(res.status);
  });

  it('never restricts a platform admin', async () => {
    fake.table('l_subscriptions', () => ({
      data: { status: 'trial', trial_ends_on: '2000-01-01' },
    }));
    fake.table('l_faults', (ctx) => ({ data: ctx.method === 'insert' ? { id: 'f1', ...ctx.payload } : [] }));
    const res = await request(app)
      .post('/api/faults')
      .set('Authorization', bearer({ role: 'manager', is_platform_admin: true, company_id: 'c1' }))
      .send({ unit_id: 'u1', description: 'x' });
    expect([200, 201]).toContain(res.status);
  });
});
