// Security-deposit ledger: recording a deposit opens a 'hold', deductions and
// refunds draw it down, the running balance is right, status follows the money,
// and you can't take out more than is held.
const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');
const { bearer } = require('../helpers/tokens');

const mgr = () => bearer({ role: 'manager', company_id: 'c1', id: 'u1' });

// A tiny stateful stand-in so entries actually accumulate across the several
// reads/writes a single request makes (the default fake is stateless).
function wireStatefulDeposit(initial) {
  let deposit = { id: 'd1', company_id: 'c1', tenant_id: 't1', amount: initial, currency: 'GHS', status: 'held', received_on: '2026-09-01' };
  let entries = [];
  fake.table('l_deposits', (ctx) => {
    if (ctx.method === 'insert') { deposit = { ...deposit, ...ctx.payload, id: 'd1' }; return { data: deposit }; }
    if (ctx.method === 'update') { deposit = { ...deposit, ...ctx.payload }; return { data: deposit }; }
    return { data: deposit };
  });
  fake.table('l_deposit_entries', (ctx) => {
    if (ctx.method === 'insert') {
      entries.push({ ...ctx.payload, created_at: new Date(Date.now() + entries.length).toISOString() });
      return { data: ctx.payload };
    }
    return { data: entries };
  });
  return { get deposit() { return deposit; }, get entries() { return entries; } };
}

beforeEach(() => fake.reset());

describe('POST /api/deposits', () => {
  it('records a deposit with a held balance equal to the amount', async () => {
    wireStatefulDeposit(1000);
    const res = await request(app).post('/api/deposits').set('Authorization', mgr())
      .send({ tenant_id: 't1', amount: 1000, currency: 'GHS' });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(1000);
    expect(res.body.status).toBe('held');
    expect(res.body.entries.filter((e) => e.kind === 'hold')).toHaveLength(1);
  });

  it('rejects a non-positive amount', async () => {
    wireStatefulDeposit(1000);
    const res = await request(app).post('/api/deposits').set('Authorization', mgr()).send({ tenant_id: 't1', amount: 0 });
    expect(res.status).toBe(400);
  });
});

describe('deduct / refund', () => {
  it('a deduction reduces the balance and sets partially_returned', async () => {
    wireStatefulDeposit(1000);
    // seed the opening hold
    await request(app).post('/api/deposits').set('Authorization', mgr()).send({ tenant_id: 't1', amount: 1000 });
    const res = await request(app).post('/api/deposits/d1/deduct').set('Authorization', mgr())
      .send({ amount: 300, reason: 'Wall repair' });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(700);
    expect(res.body.status).toBe('partially_returned');
  });

  it('refunding the remainder settles it as returned with zero balance', async () => {
    wireStatefulDeposit(1000);
    await request(app).post('/api/deposits').set('Authorization', mgr()).send({ tenant_id: 't1', amount: 1000 });
    await request(app).post('/api/deposits/d1/deduct').set('Authorization', mgr()).send({ amount: 300 });
    const res = await request(app).post('/api/deposits/d1/refund').set('Authorization', mgr()).send({ amount: 700 });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0);
    expect(res.body.status).toBe('returned');
  });

  it('refuses to take out more than is held', async () => {
    wireStatefulDeposit(1000);
    await request(app).post('/api/deposits').set('Authorization', mgr()).send({ tenant_id: 't1', amount: 1000 });
    const res = await request(app).post('/api/deposits/d1/refund').set('Authorization', mgr()).send({ amount: 1500 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/still held/i);
  });

  it('deducting the whole deposit marks it forfeited', async () => {
    wireStatefulDeposit(1000);
    await request(app).post('/api/deposits').set('Authorization', mgr()).send({ tenant_id: 't1', amount: 1000 });
    const res = await request(app).post('/api/deposits/d1/deduct').set('Authorization', mgr()).send({ amount: 1000, reason: 'Unpaid rent' });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(0);
    expect(res.body.status).toBe('forfeited');
  });
});
