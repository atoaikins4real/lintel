// PAYSTACK WEBHOOK DISPATCHER
//
// One Paystack account, many apps. Paystack allows exactly one webhook URL
// per mode, so this tiny function IS that URL. It verifies the event once,
// works out which app the payment belongs to (by the reference prefix), and
// forwards the untouched event on to that app's own webhook. Add an app by
// adding one entry to WEBHOOK_ROUTES — nothing here needs to change.
//
// Why forwarding is safe: every app on this Paystack account shares the same
// secret, so the ORIGINAL signature still verifies at the destination. We
// forward the exact bytes and the original signature header, and each app
// independently re-verifies and ignores any reference that isn't its own.
//
// Environment variables (set in this site's Netlify settings):
//   PAYSTACK_SECRET_KEY  the account's secret (sk_test_… or sk_live_…).
//                        Must match the mode this URL is registered under.
//   WEBHOOK_ROUTES       JSON mapping a reference prefix to an app webhook, e.g.
//                        {"LX-":"https://lintelapp.netlify.app/api/paystack/webhook"}
//   WEBHOOK_DEFAULT      where to send everything that matches no prefix —
//                        typically the incumbent app (Tractor's webhook URL).
//
// Register this function's URL in Paystack as  https://<this-site>/webhook
// (the redirect in netlify.toml maps /webhook to this function).

const crypto = require('crypto');

const secret = () => process.env.PAYSTACK_SECRET_KEY || '';

function routeTable() {
  try {
    const parsed = JSON.parse(process.env.WEBHOOK_ROUTES || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    console.error('[dispatch] WEBHOOK_ROUTES is not valid JSON — treating as empty');
    return {};
  }
}

// HMAC-SHA512 over the exact received bytes, constant-time compared.
function verify(rawBuf, signature) {
  const key = secret();
  if (!key || !signature) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBuf).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// First prefix that the reference starts with wins; otherwise the default.
function targetFor(reference) {
  const ref = String(reference || '');
  const table = routeTable();
  for (const prefix of Object.keys(table)) {
    if (ref.startsWith(prefix)) return table[prefix];
  }
  return process.env.WEBHOOK_DEFAULT || '';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Netlify lowercases header names.
  const signature = event.headers['x-paystack-signature'];
  const rawBuf = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');

  if (!verify(rawBuf, signature)) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  let reference;
  try {
    reference = JSON.parse(rawBuf.toString('utf8'))?.data?.reference;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Malformed payload' }) };
  }

  const target = targetFor(reference);
  if (!target) {
    // Verified, but nothing is configured to receive it. Acknowledge so
    // Paystack doesn't retry a message no one wants.
    console.log('[dispatch] no route for reference', reference);
    return { statusCode: 200, body: JSON.stringify({ received: true, routed: false }) };
  }

  // Forward verbatim. On any upstream failure return 5xx so Paystack retries
  // the whole delivery later — the destination apps are idempotent, so a
  // retry can never double-apply anything.
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
      body: rawBuf,
    });
    if (!res.ok) {
      console.error('[dispatch] target responded', res.status, target);
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream error' }) };
    }
  } catch (err) {
    console.error('[dispatch] forward failed:', err?.message || err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Forward failed' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true, routed: true }) };
};
