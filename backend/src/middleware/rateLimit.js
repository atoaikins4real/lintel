const rateLimit = require('express-rate-limit');

// Applied to the public auth endpoints (login, signup, bootstrap register)
// so a stranger can't brute-force passwords or hammer account creation.
// Keyed by IP by default, which is what we want here (no per-account state).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window is plenty for a real person, not a script
  standardHeaders: true,
  legacyHeaders: false,
  // Running behind serverless-http on Netlify Functions, req.ip isn't
  // always populated the way express-rate-limit's default keyGenerator
  // expects — it THROWS on an undefined IP rather than falling back
  // (ERR_ERL_UNDEFINED_IP_ADDRESS), which would take down the whole login
  // route. Fall back through the headers Netlify/most proxies actually
  // set, and never throw — worst case is coarser rate limiting, not a
  // crashed auth endpoint.
  keyGenerator: (req) =>
    req.headers['x-nf-client-connection-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown',
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter };
