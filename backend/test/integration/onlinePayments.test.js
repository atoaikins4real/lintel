// End-to-end online-payment path: the Paystack webhook and its
// reconciliation, plus the tenant-portal /pay/initialize guards. Uses the
// real Express app with the in-memory Supabase fake; Paystack's own HTTP is
// stubbed via global.fetch where a happy path needs it.
const crypto = require('crypto');

// The webhook's signature check reads this. Set before the app graph loads.
process.env.PAYSTACK_SECRET_KEY = 'sk_test_online';
process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_online';

const { app, fake } = require('../helpers/appWithFake');
const request = require('supertest');

const SECRET = 'sk_test_online';
const sign = (body) => crypto.createHmac('sha512', SECRET).update(body).digest('hex');
const post = (payload) => {
  const body = JSON.stringify(payload);
  return { body, sig: sign(body) };
};

beforeEach(() => fake.reset());

describe('POST /api/paystack/webhook', () => {
  it('rejects a request with no signature (401)', async () => {
    const { body } = post({ event: 'charge.success', data: { reference: 'LX-1' } });
    const res = await request(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  it('rejects a forged signature (401) and touches nothing', async () => {
    let paymentTouched = false;
    fake.table('l_payments', () => { paymentTouched = true; return { data: null }; });
    const { body } = post({ event: 'charge.success', data: { reference: 'LX-1', status: 'success' } });
    const res = await request(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'not-a-real-signature')
      .send(body);
    expect(res.status).toBe(401);
    expect(paymentTouched).toBe(false);
  });

  it('reconciles a valid charge.success: marks the charge paid exactly once', async () => {
    const txn = { id: 't1', company_id: 'c1', payment_id: 'p1', tenant_id: 'ten1', amount: 1000, currency: 'GHS', status: 'initialized' };
    let paymentUpdate = null;
    let txnUpdate = null;
    fake.table('l_payment_transactions', (ctx) => {
      if (ctx.method === 'update') { txnUpdate = ctx.payload; return { data: { ...txn, ...ctx.payload } }; }
      return { data: txn }; // the reference lookup
    });
    fake.table('l_payments', (ctx) => {
      if (ctx.method === 'update') paymentUpdate = ctx.payload;
      return { data: { id: 'p1' } };
    });

    const { body, sig } = post({
      event: 'charge.success',
      data: { reference: 'LX-1', status: 'success', amount: 100000, currency: 'GHS', channel: 'mobile_money' },
    });
    const res = await request(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(txnUpdate.status).toBe('success');
    expect(paymentUpdate).toMatchObject({ status: 'paid', gateway: 'paystack', gateway_reference: 'LX-1', method: 'mobile_money' });
  });

  it('is idempotent: a repeat event for an already-settled txn does not re-pay', async () => {
    const txn = { id: 't1', company_id: 'c1', payment_id: 'p1', tenant_id: 'ten1', amount: 1000, currency: 'GHS', status: 'success' };
    let paymentUpdated = false;
    fake.table('l_payment_transactions', () => ({ data: txn }));
    fake.table('l_payments', (ctx) => { if (ctx.method === 'update') paymentUpdated = true; return { data: { id: 'p1' } }; });

    const { body, sig } = post({
      event: 'charge.success',
      data: { reference: 'LX-1', status: 'success', amount: 100000, currency: 'GHS', channel: 'card' },
    });
    const res = await request(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(paymentUpdated).toBe(false);
  });

  it('does NOT pay on an amount mismatch (flags the txn instead)', async () => {
    const txn = { id: 't1', company_id: 'c1', payment_id: 'p1', tenant_id: 'ten1', amount: 1000, currency: 'GHS', status: 'initialized' };
    let paymentUpdated = false;
    let txnUpdate = null;
    fake.table('l_payment_transactions', (ctx) => {
      if (ctx.method === 'update') { txnUpdate = ctx.payload; return { data: txn }; }
      return { data: txn };
    });
    fake.table('l_payments', (ctx) => { if (ctx.method === 'update') paymentUpdated = true; return { data: { id: 'p1' } }; });

    // 500.00 arrived for a 1000.00 charge — someone replayed a reference.
    const { body, sig } = post({
      event: 'charge.success',
      data: { reference: 'LX-1', status: 'success', amount: 50000, currency: 'GHS', channel: 'mobile_money' },
    });
    const res = await request(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(paymentUpdated).toBe(false);
    expect(txnUpdate.status).toBe('failed');
  });

  it('ignores an event whose reference we never initialized', async () => {
    let paymentTouched = false;
    fake.table('l_payment_transactions', () => ({ data: null })); // unknown reference
    fake.table('l_payments', () => { paymentTouched = true; return { data: null }; });
    const { body, sig } = post({
      event: 'charge.success',
      data: { reference: 'SOMEONE-ELSES-REF', status: 'success', amount: 100000, currency: 'GHS' },
    });
    const res = await request(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);
    expect(res.status).toBe(200);
    expect(paymentTouched).toBe(false);
  });
});

// ---- tenant-portal /pay/initialize guards ---------------------------------
// A valid, unexpired portal token pinned to tenant ten1 / company c1.
function withValidToken() {
  fake.table('l_tenant_portal_tokens', () => ({
    data: { id: 'tok1', tenant_id: 'ten1', company_id: 'c1', expires_at: new Date(Date.now() + 86400000).toISOString(), revoked_at: null },
  }));
}

describe('POST /api/tenant-portal/pay/initialize', () => {
  it('refuses when the subscriber has not enabled online payments (503)', async () => {
    withValidToken();
    fake.table('l_payments', () => ({ data: { id: 'p1', amount: 1000, currency: 'GHS', status: 'pending', tenant_id: 'ten1' } }));
    fake.table('l_settings', () => ({ data: { online_payments_enabled: false, paystack_subaccount_code: null } }));

    const res = await request(app).post('/api/tenant-portal/pay/initialize').send({ token: 'raw', payment_id: 'p1' });
    expect(res.status).toBe(503);
  });

  it('refuses a charge that is already paid (409)', async () => {
    withValidToken();
    fake.table('l_payments', () => ({ data: { id: 'p1', amount: 1000, currency: 'GHS', status: 'paid', tenant_id: 'ten1' } }));
    const res = await request(app).post('/api/tenant-portal/pay/initialize').send({ token: 'raw', payment_id: 'p1' });
    expect(res.status).toBe(409);
  });

  it('refuses a currency Paystack cannot settle (422)', async () => {
    withValidToken();
    fake.table('l_payments', () => ({ data: { id: 'p1', amount: 1000, currency: 'EUR', status: 'pending', tenant_id: 'ten1' } }));
    fake.table('l_settings', () => ({ data: { online_payments_enabled: true, paystack_subaccount_code: 'ACCT_x' } }));
    const res = await request(app).post('/api/tenant-portal/pay/initialize').send({ token: 'raw', payment_id: 'p1' });
    expect(res.status).toBe(422);
  });

  it('refuses when the link token is invalid (400)', async () => {
    fake.table('l_tenant_portal_tokens', () => ({ data: null }));
    const res = await request(app).post('/api/tenant-portal/pay/initialize').send({ token: 'bad', payment_id: 'p1' });
    expect(res.status).toBe(400);
  });

  it('initializes a payment and returns the Paystack checkout URL', async () => {
    withValidToken();
    fake.table('l_payments', () => ({ data: { id: 'p1', amount: 1000, currency: 'GHS', status: 'pending', tenant_id: 'ten1' } }));
    fake.table('l_settings', () => ({ data: { online_payments_enabled: true, paystack_subaccount_code: 'ACCT_x' } }));
    fake.table('l_tenants', () => ({ data: { email: 'tenant@example.test', first_name: 'Ama' } }));
    fake.table('l_payment_transactions', () => ({ data: { id: 'newtxn' } })); // insert

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', reference: 'ignored' } }),
    });
    const original = global.fetch;
    global.fetch = fetchMock;
    try {
      const res = await request(app).post('/api/tenant-portal/pay/initialize').send({ token: 'raw', payment_id: 'p1' });
      expect(res.status).toBe(200);
      expect(res.body.authorization_url).toBe('https://checkout.paystack.com/abc');
      // The Paystack call carried the subscriber's subaccount so settlement
      // goes to them, and an amount in minor units.
      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.subaccount).toBe('ACCT_x');
      expect(sentBody.amount).toBe(100000);
      expect(sentBody.bearer).toBe('subaccount');
    } finally {
      global.fetch = original;
    }
  });
});
