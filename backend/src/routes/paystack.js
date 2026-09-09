// PAYSTACK WEBHOOK
//
// Paystack calls this when a payment resolves. It is the AUTHORITATIVE path
// that marks a charge paid — the tenant's browser redirect is only a hint and
// can be lost (they close the tab, the network drops); this event is not.
//
// Mounted in app.js BEFORE express.json and BEFORE requireAuth, with a raw
// body parser, because:
//   1. There is no session here — Paystack is the caller. The signature IS
//      the authentication.
//   2. The signature is computed over the EXACT bytes Paystack sent, so we
//      must verify against the raw body, before any JSON re-encoding.
//
// It always answers 200 once the signature is valid, even for events we don't
// act on, so Paystack doesn't retry deliverable events forever. A bad or
// missing signature gets 401 and nothing is touched.
const express = require('express');
const paystack = require('../utils/paystack');
const { reconcilePaystackData } = require('../utils/reconcile');

const router = express.Router();

// req.body is a Buffer here (see the raw parser in app.js).
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

  if (!paystack.verifyWebhookSignature(raw, signature)) {
    // Either forged, or the platform hasn't configured its key yet. Either
    // way we can't trust it — refuse without touching anything.
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Malformed payload' });
  }

  // Acknowledge fast; only charge.success carries a settlement to apply.
  // Errors during reconciliation are logged, not thrown back at Paystack —
  // a 500 would make it retry, and the idempotency guards make a retry
  // harmless anyway, but there's no reason to invite one on a bug.
  try {
    if (event?.event === 'charge.success' && event?.data) {
      await reconcilePaystackData(event.data);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Paystack webhook reconciliation failed:', err?.message || err);
  }

  return res.status(200).json({ received: true });
});

module.exports = router;
