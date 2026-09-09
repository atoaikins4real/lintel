// The nightly safety-net sweep: for every online payment still sitting at
// "initialized", ask Paystack whether it actually succeeded and reconcile it.
// This is what lets Lintel confirm payments even when the webhook never
// arrives (e.g. it was routed to another app on a shared Paystack account).
const fake = require('../helpers/fakeSupabase');

// Swap the client before requiring the module under test (same seam the app
// helper uses), and configure Paystack so the sweep doesn't early-return.
process.env.PAYSTACK_SECRET_KEY = 'sk_test_sweep';
const cfg = require('../../src/config/supabase');
cfg.supabase = fake.supabase;
const { reconcilePendingOnlinePayments } = require('../../src/scheduledBilling');

beforeEach(() => fake.reset());

// One fake handler serves both reads against l_payment_transactions:
//  - the sweep's own "give me the pending ones" (filtered by status)
//  - reconcile's "find the txn for this reference" (filtered by reference)
function wireTransactions(pendingRefs, txnByRef) {
  fake.table('l_payment_transactions', (ctx) => {
    if (ctx.hasFilter('eq', 'status')) {
      return { data: pendingRefs.map((reference) => ({ reference })) };
    }
    if (ctx.hasFilter('eq', 'reference')) {
      const ref = ctx.eqValue('reference');
      return { data: txnByRef[ref] || null };
    }
    return { data: null }; // updates
  });
}

describe('reconcilePendingOnlinePayments', () => {
  it('confirms a pending attempt that Paystack reports as successful', async () => {
    wireTransactions(['LX-a'], {
      'LX-a': { id: 't1', company_id: 'c1', payment_id: 'p1', tenant_id: 'ten1', amount: 1000, currency: 'GHS', status: 'initialized' },
    });
    let paidId = null;
    fake.table('l_payments', (ctx) => { if (ctx.method === 'update') paidId = ctx.eqValue('id'); return { data: { id: 'p1' } }; });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { reference: 'LX-a', status: 'success', amount: 100000, currency: 'GHS', channel: 'mobile_money' } }),
    });
    const original = global.fetch;
    global.fetch = fetchMock;
    try {
      const settled = await reconcilePendingOnlinePayments();
      expect(settled).toBe(1);
      expect(paidId).toBe('p1');
    } finally {
      global.fetch = original;
    }
  });

  it('leaves a still-unpaid attempt alone and counts nothing', async () => {
    wireTransactions(['LX-b'], {
      'LX-b': { id: 't2', company_id: 'c1', payment_id: 'p2', tenant_id: 'ten1', amount: 500, currency: 'GHS', status: 'initialized' },
    });
    let paid = false;
    fake.table('l_payments', (ctx) => { if (ctx.method === 'update') paid = true; return { data: { id: 'p2' } }; });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: true, data: { reference: 'LX-b', status: 'abandoned', amount: 50000, currency: 'GHS' } }),
    });
    const original = global.fetch;
    global.fetch = fetchMock;
    try {
      const settled = await reconcilePendingOnlinePayments();
      expect(settled).toBe(0);
      expect(paid).toBe(false);
    } finally {
      global.fetch = original;
    }
  });

  it('does nothing when there are no pending attempts', async () => {
    wireTransactions([], {});
    const fetchMock = vi.fn();
    const original = global.fetch;
    global.fetch = fetchMock;
    try {
      const settled = await reconcilePendingOnlinePayments();
      expect(settled).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled(); // never bothered Paystack
    } finally {
      global.fetch = original;
    }
  });
});
