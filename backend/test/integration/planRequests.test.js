// Self-serve plan changes. Subscribers submit a change/cancel REQUEST
// (subscription state stays operator-controlled); the operator applies or
// declines it. These tests pin: manager-only submission, company scoping
// (the request carries the token's company, not the body's), the one-pending
// rule, that the routes are NOT blocked by the lapsed-subscription gate, and
// the operator apply/decline effects.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

beforeEach(() => fake.reset());

const manager = (over) => bearer({ role: 'manager', company_id: 'c1', ...over });

describe('GET /api/subscription/plans', () => {
  it('returns the active catalogue to any signed-in user', async () => {
    fake.table('l_plans', () => ({ data: [{ id: 'p1', code: 'starter', name: 'Starter', price: 250 }] }));
    const res = await request(app).get('/api/subscription/plans').set('Authorization', bearer({ role: 'viewer', company_id: 'c1' }));
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Starter');
  });
});

describe('POST /api/subscription/requests', () => {
  it('lets a manager submit a plan-change request (201), scoped to the token company', async () => {
    let inserted = null;
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-current', status: 'active' } }));
    fake.table('l_plans', () => ({ data: { id: 'p-new', is_active: true, name: 'Classic' } }));
    fake.table('l_companies', () => ({ data: { name: 'Acme' } }));
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'insert') { inserted = ctx.payload; return { data: { id: 'r1', ...ctx.payload } }; }
      return { data: null }; // no existing pending
    });

    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'change', requested_plan_id: 'p-new', note: 'please', company_id: 'c-EVIL' });

    expect(res.status).toBe(201);
    expect(inserted.company_id).toBe('c1'); // token, not body
    expect(inserted.company_id).not.toBe('c-EVIL');
    expect(inserted.requested_by).toBe('user-1');
    expect(inserted.kind).toBe('change');
  });

  it('refuses a viewer (403) — state changes are manager-only', async () => {
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', bearer({ role: 'viewer', company_id: 'c1' }))
      .send({ kind: 'cancel' });
    expect(res.status).toBe(403);
  });

  it('refuses a finance user (403)', async () => {
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', bearer({ role: 'finance', company_id: 'c1' }))
      .send({ kind: 'cancel' });
    expect(res.status).toBe(403);
  });

  it('requires a plan id for a change request (400)', async () => {
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-current', status: 'active' } }));
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'change' });
    expect(res.status).toBe(400);
  });

  it('rejects switching to the plan you are already on (400)', async () => {
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-same', status: 'active' } }));
    fake.table('l_plans', () => ({ data: { id: 'p-same', is_active: true, name: 'Starter' } }));
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'change', requested_plan_id: 'p-same' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already on that plan/i);
  });

  it('rejects an unavailable plan (404)', async () => {
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-current', status: 'active' } }));
    fake.table('l_plans', () => ({ data: { id: 'p-x', is_active: false, name: 'Retired' } }));
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'change', requested_plan_id: 'p-x' });
    expect(res.status).toBe(404);
  });

  it('rejects a second request while one is already pending (409)', async () => {
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-current', status: 'active' } }));
    fake.table('l_plans', () => ({ data: { id: 'p-new', is_active: true, name: 'Classic' } }));
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'select') return { data: { id: 'existing-pending' } };
      return { data: null };
    });
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'change', requested_plan_id: 'p-new' });
    expect(res.status).toBe(409);
  });

  it('accepts a cancellation request with no plan id', async () => {
    let inserted = null;
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-current', status: 'active' } }));
    fake.table('l_companies', () => ({ data: { name: 'Acme' } }));
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'insert') { inserted = ctx.payload; return { data: { id: 'r2', ...ctx.payload } }; }
      return { data: null };
    });
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'cancel' });
    expect(res.status).toBe(201);
    expect(inserted.kind).toBe('cancel');
    expect(inserted.requested_plan_id).toBeNull();
  });

  it('is NOT blocked by a lapsed subscription (a lapsed user must be able to upgrade)', async () => {
    // If the write-gate applied here it would 402. It must not: /subscription
    // is exempt in app.js. We prove the request reaches the handler.
    let inserted = null;
    fake.table('l_subscriptions', () => ({ data: { plan_id: 'p-trial', status: 'trial', trial_ends_on: '2000-01-01' } }));
    fake.table('l_plans', () => ({ data: { id: 'p-new', is_active: true, name: 'Starter' } }));
    fake.table('l_companies', () => ({ data: { name: 'Acme' } }));
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'insert') { inserted = ctx.payload; return { data: { id: 'r3', ...ctx.payload } }; }
      return { data: null };
    });
    const res = await request(app)
      .post('/api/subscription/requests')
      .set('Authorization', manager())
      .send({ kind: 'change', requested_plan_id: 'p-new' });
    expect(res.status).toBe(201);
    expect(inserted).not.toBeNull();
  });
});

describe('GET/DELETE /api/subscription/requests', () => {
  it('lists only the caller company\'s requests', async () => {
    fake.table('l_subscription_requests', () => ({ data: [{ id: 'r1', kind: 'change', status: 'pending' }] }));
    await request(app).get('/api/subscription/requests').set('Authorization', manager({ company_id: 'co-77' }));
    const filters = fake.callsTo('l_subscription_requests')
      .flatMap((c) => c.filters)
      .filter((f) => f[0] === 'eq' && f[1] === 'company_id')
      .map((f) => f[2]);
    expect(filters).toContain('co-77');
    expect(filters.every((v) => v === 'co-77')).toBe(true);
  });

  it('withdraws the company\'s own pending request', async () => {
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'update') return { data: { id: 'r1', status: 'withdrawn' } };
      return { data: null };
    });
    const res = await request(app).delete('/api/subscription/requests/r1').set('Authorization', manager());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('withdrawn');
    // The update was constrained to the token company and to a pending row.
    const upd = fake.callsTo('l_subscription_requests').find((c) => c.method === 'update');
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'company_id', 'c1'], ['eq', 'status', 'pending']]));
  });

  it('404s when there is no pending request to withdraw', async () => {
    fake.table('l_subscription_requests', () => ({ data: null }));
    const res = await request(app).delete('/api/subscription/requests/r9').set('Authorization', manager());
    expect(res.status).toBe(404);
  });
});

describe('operator: /api/admin/plan-requests', () => {
  const admin = () => bearer({ role: 'manager', is_platform_admin: true, company_id: 'ops' });

  it('is hidden (404) from non-admins', async () => {
    const res = await request(app).get('/api/admin/plan-requests').set('Authorization', manager());
    expect(res.status).toBe(404);
  });

  it('applying a change moves the subscription onto the plan and snapshots its price', async () => {
    let subUpdate = null;
    fake.table('l_users', () => ({ data: { is_platform_admin: true } })); // requirePlatformAdmin DB re-check
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'select' || ctx.maybeSingle) return { data: { id: 'r1', company_id: 'c1', kind: 'change', requested_plan_id: 'p-new', status: 'pending' } };
      if (ctx.method === 'update') return { data: { id: 'r1', status: 'applied' } };
      return { data: null };
    });
    fake.table('l_plans', () => ({ data: { id: 'p-new', price: 600, currency: 'GHS' } }));
    fake.table('l_subscriptions', (ctx) => {
      if (ctx.method === 'update') { subUpdate = ctx.payload; return { data: { company_id: 'c1', plan_id: 'p-new', amount: 600 } }; }
      return { data: null };
    });

    const res = await request(app).post('/api/admin/plan-requests/r1/apply').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(subUpdate).toMatchObject({ plan_id: 'p-new', amount: 600, status: 'active' });
    expect(res.body.request.status).toBe('applied');
    // Scoped to the request's company, not the admin's own.
    const su = fake.callsTo('l_subscriptions').find((c) => c.method === 'update');
    expect(su.filters).toEqual(expect.arrayContaining([['eq', 'company_id', 'c1']]));
  });

  it('applying a cancel sets the subscription to cancelled', async () => {
    let subUpdate = null;
    fake.table('l_users', () => ({ data: { is_platform_admin: true } }));
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.maybeSingle || ctx.method === 'select') return { data: { id: 'r2', company_id: 'c1', kind: 'cancel', requested_plan_id: null, status: 'pending' } };
      if (ctx.method === 'update') return { data: { id: 'r2', status: 'applied' } };
      return { data: null };
    });
    fake.table('l_subscriptions', (ctx) => {
      if (ctx.method === 'update') { subUpdate = ctx.payload; return { data: { company_id: 'c1', status: 'cancelled' } }; }
      return { data: null };
    });
    const res = await request(app).post('/api/admin/plan-requests/r2/apply').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(subUpdate.status).toBe('cancelled');
  });

  it('refuses to apply a request that is not pending (409)', async () => {
    fake.table('l_users', () => ({ data: { is_platform_admin: true } }));
    fake.table('l_subscription_requests', () => ({ data: { id: 'r3', company_id: 'c1', kind: 'change', status: 'applied' } }));
    const res = await request(app).post('/api/admin/plan-requests/r3/apply').set('Authorization', admin());
    expect(res.status).toBe(409);
  });

  it('declines a pending request without touching the subscription', async () => {
    fake.table('l_users', () => ({ data: { is_platform_admin: true } }));
    let subTouched = false;
    fake.table('l_subscriptions', () => { subTouched = true; return { data: null }; });
    fake.table('l_subscription_requests', (ctx) => {
      if (ctx.method === 'update') return { data: { id: 'r4', status: 'declined' } };
      return { data: null };
    });
    const res = await request(app).post('/api/admin/plan-requests/r4/decline').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('declined');
    expect(subTouched).toBe(false);
  });
});
