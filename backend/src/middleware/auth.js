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
//
// Async because it enforces IMMEDIATE session revocation: role and company_id
// live in a 7-day token, so without this a demotion, a move between
// companies, or offboarding a staff member would take up to a week to bite.
// Each request re-reads the caller's own `session_valid_from` cutoff (a fast
// primary-key lookup) and rejects any token minted before it — the next
// sign-in issues a token with the new role/company. See the column in
// db/schema.sql and where it's bumped (routes/auth.js, routes/admin.js).
async function requireAuth(req, res, next) {
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

    // Revocation check. Scoped by the user id in the caller's own signed
    // token (not company_id) — see the audit-scoping allow-list entry.
    try {
      const { supabase } = require('../config/supabase');
      const { data: acct, error } = await supabase
        .from('l_users')
        .select('session_valid_from')
        .eq('id', payload.sub)
        .maybeSingle();

      // Fail OPEN on a lookup error: an outage in this check must not lock
      // every customer out. But a MISSING row means the account was deleted
      // (offboarded) — that token should stop working immediately.
      if (!error) {
        if (!acct) {
          return res.status(401).json({ error: 'Your session is no longer valid — please sign in again.' });
        }
        if (acct.session_valid_from) {
          // Compare at second precision (JWT `iat` is whole seconds): a token
          // issued in the same second as the cutoff, or later, is fine — only
          // strictly-earlier tokens are revoked. This avoids rejecting the
          // fresh token a user gets by signing back in.
          const cutoffSec = Math.floor(new Date(acct.session_valid_from).getTime() / 1000);
          if (payload.iat && cutoffSec > payload.iat) {
            return res.status(401).json({ error: 'You have been signed out — please sign in again.' });
          }
        }
      }
    } catch (revErr) {
      // Fail open — never let this check be the reason the whole API is down.
      // eslint-disable-next-line no-console
      console.error('Session revocation check failed, allowing request through:', revErr?.message || revErr);
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
//
// The platform admin (godmode / the Lintel operator) bypasses every in-company
// role gate: they have full access to every page and feature, on top of the
// operator-only Subscribers area. That flag is set only in the database and
// re-checked live by requirePlatformAdmin for the admin routes, so treating it
// as an override here doesn't widen who can become one.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.is_platform_admin === true) return next();
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
