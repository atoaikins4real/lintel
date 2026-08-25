// Mints real, correctly-signed tokens using the app's own signToken, so the
// integration tests exercise the genuine verify path in middleware/auth —
// not a hand-rolled JWT that might diverge from what the app issues.
const jwt = require('jsonwebtoken');
const { signToken } = require('../../src/middleware/auth');

function tokenFor({
  id = 'user-1',
  email = 'user@example.test',
  name = 'Test User',
  role = 'manager',
  company_id = 'company-1',
  is_platform_admin = false,
} = {}) {
  return signToken({ id, email, name, role, company_id, is_platform_admin });
}

function bearer(overrides) {
  return `Bearer ${tokenFor(overrides)}`;
}

// A deliberately legacy token with no company_id, to prove the "please sign
// in again" rejection. Signed with the same secret so it's otherwise valid.
function legacyTokenNoCompany() {
  return jwt.sign({ sub: 'old-user', email: 'old@example.test', role: 'manager' }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

module.exports = { tokenFor, bearer, legacyTokenNoCompany };
