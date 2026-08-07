const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign(
    // company_id is what every data route scopes on — it must come from
    // the signed token, never from the request body, or one company could
    // read another's data just by passing a different id.
    { sub: user.id, email: user.email, name: user.name, role: user.role, company_id: user.company_id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Verifies the Bearer token and attaches { id, email, name, role } to req.user.
function requireAuth(req, res, next) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfigured: JWT_SECRET is not set' });
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = jwt.verify(token, JWT_SECRET);

    // Tokens issued before multi-tenancy have no company_id. Rather than
    // silently defaulting them into some company's data, force a re-login.
    if (!payload.company_id) {
      return res.status(401).json({ error: 'Your session predates a security update — please sign in again.' });
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      company_id: payload.company_id,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// requireRole('manager', 'finance') — 403s if req.user.role isn't in the list.
// Must run after requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

// Convenience: any authenticated user can read; only manager/finance can write.
// Use as router.use(gateMutations) at the top of a CRUD router.
function gateMutations(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return requireRole('manager', 'finance')(req, res, next);
  }
  next();
}

module.exports = { signToken, requireAuth, requireRole, gateMutations };
