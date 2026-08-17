const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign(
    // company_id is what every data route scopes on — it must come from
    // the signed token, never from the request body, or one company could
    // read another's data just by passing a different id.
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: user.company_id,
      // Platform admin = operator of Lintel itself. Distinct from `role`,
      // which only ever describes authority inside one's own company.
      is_platform_admin: user.is_platform_admin === true,
    },
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
      is_platform_admin: payload.is_platform_admin === true,
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

// Gate for platform-owner routes (/api/admin/*), which deliberately reach
// across every company.
//
// The token carries is_platform_admin, but tokens live for 7 days — so
// revoking someone's admin rights would otherwise take up to a week to
// take effect. For a role this powerful that's not acceptable, so this
// re-reads the flag from the database on every request. It's one extra
// query on a handful of low-traffic routes.
function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });

  // Cheap rejection first — no DB round trip for ordinary users.
  if (!req.user.is_platform_admin) {
    return res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
  }

  const { supabase } = require('../config/supabase');
  supabase
    .from('l_users')
    .select('is_platform_admin')
    .eq('id', req.user.id)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) return next(error);
      if (!data?.is_platform_admin) {
        return res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
      }
      next();
    })
    .catch(next);
}

module.exports = { signToken, requireAuth, requireRole, gateMutations, requirePlatformAdmin };
