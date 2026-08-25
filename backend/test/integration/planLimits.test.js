// Plan limits block CREATING new records beyond a plan's allowance, and only
// creates — edits/deletes always work. A blocked create returns 402 with the
// cause and the way out; nothing already stored is touched.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

beforeEach(() => fake.reset());

// Both the subscription gate and the plan-limit middleware read
// l_subscriptions, distinguished by which columns they select.
function subscriptionHandler({ plan }) {
  return (ctx) => {
    const sel = String(ctx.select || '');
    if (sel.includes('l_plans')) {
      // planLimits: select 'l_plans(name, max_*)'
      return { data: { l_plans: plan } };
    }
    // enforceSubscription: select 'status, trial_ends_on, renews_on' — return
    // a healthy trial so the write isn't blocked for the wrong reason.
    return { data: { status: 'trial', trial_ends_on: '2099-01-01', renews_on: null } };
  };
}

describe('POST /api/tenants under a plan limit', () => {
  it('blocks with 402 when usage is already at the limit', async () => {
    fake.table('l_subscriptions', subscriptionHandler({ plan: { name: 'Starter', max_tenants: 10 } }));
    fake.table('l_tenants', () => ({ count: 10 })); // head:true count query
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', bearer({ role: 'manager', company_id: 'c1' }))
      .send({ first_name: 'Ada', last_name: 'Lovelace' });

    expect(res.status).toBe(402);
    expect(res.body.limit_reached).toBe('tenants');
    expect(res.body.limit).toBe(10);
    expect(res.body.current).toBe(10);
    expect(res.body.error).toMatch(/upgrade/i);
  });

  it('allows the create when usage is below the limit', async () => {
    fake.table('l_subscriptions', subscriptionHandler({ plan: { name: 'Starter', max_tenants: 10 } }));
    fake.table('l_tenants', (ctx) => {
      if (ctx.selectOpts && ctx.selectOpts.head) return { count: 3 };
      if (ctx.method === 'insert') return { data: { id: 't1', ...ctx.payload } };
      return { data: [] };
    });
    fake.table('l_tenant_id_counters', () => ({ data: null })); // first ID of the year
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', bearer({ role: 'manager', company_id: 'c1' }))
      .send({ first_name: 'Ada', last_name: 'Lovelace' });

    expect(res.status).toBe(201);
    expect(res.body.lintel_id).toMatch(/^LNT-\d{4}-0001$/);
  });

  it('treats a null limit as unlimited (Premium plan) and allows the create', async () => {
    fake.table('l_subscriptions', subscriptionHandler({ plan: { name: 'Premium', max_tenants: null } }));
    fake.table('l_tenants', (ctx) => {
      if (ctx.method === 'insert') return { data: { id: 't2', ...ctx.payload } };
      return { data: [] };
    });
    fake.table('l_tenant_id_counters', () => ({ data: null }));
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', bearer({ role: 'manager', company_id: 'c1' }))
      .send({ first_name: 'Grace', last_name: 'Hopper' });
    expect(res.status).toBe(201);
  });

  it('is never applied to a platform admin', async () => {
    // Admin token: enforcePlanLimit early-returns without even reading a plan.
    fake.table('l_tenants', (ctx) => {
      if (ctx.method === 'insert') return { data: { id: 't3', ...ctx.payload } };
      return { data: [] };
    });
    fake.table('l_subscriptions', () => ({ data: null }));
    fake.table('l_tenant_id_counters', () => ({ data: null }));
    const res = await request(app)
      .post('/api/tenants')
      .set('Authorization', bearer({ role: 'manager', is_platform_admin: true, company_id: 'c1' }))
      .send({ first_name: 'Op', last_name: 'Erator' });
    expect(res.status).toBe(201);
  });

  it('never blocks an edit — PUT is exempt even at the limit', async () => {
    fake.table('l_subscriptions', subscriptionHandler({ plan: { name: 'Starter', max_tenants: 10 } }));
    fake.table('l_tenants', (ctx) => {
      if (ctx.method === 'update') return { data: { id: 't1', first_name: 'Edited' } };
      return { count: 999, data: [] };
    });
    const res = await request(app)
      .put('/api/tenants/t1')
      .set('Authorization', bearer({ role: 'manager', company_id: 'c1' }))
      .send({ first_name: 'Edited' });
    expect(res.status).toBe(200);
  });
});
