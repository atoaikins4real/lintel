const rateLimit = require('express-rate-limit');

// Applied to the public auth endpoints (login, signup, bootstrap register)
// so a stranger can't brute-force passwords or hammer account creation.
// Keyed by IP by default, which is what we want here (no per-account state).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window is plenty for a real person, not a script
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter };
