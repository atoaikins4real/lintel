const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { seedDemoData } = require('../utils/seedDemoData');

const router = express.Router();

// GET /api/auth/bootstrap-status
// Retained for the frontend's benefit. Since every signup now creates its
// own company, there's no global "first user" state any more — this always
// reports false and the login page shows the normal sign-in form.
router.get('/bootstrap-status', async (req, res) => {
  res.json({ needsBootstrap: false });
});

/** "Ako Properties Ltd" -> "ako-properties-ltd", made unique if taken. */
async function uniqueSlug(name) {
  const base =
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'company';

  let slug = base;
  for (let i = 0; i < 50; i++) {
    const { data } = await supabase.from('l_companies').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now()}`;
}

// POST /api/auth/register — create a colleague's account inside the
// CALLER'S company. Manager only. The new user always inherits
// req.user.company_id; a company_id in the request body is ignored.
router.post('/register', authLimiter, requireAuth, requireRole('manager'), async (req, res, next) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  return createUser({ email, password, name, role, companyId: req.user.company_id }, res, next);
});

// POST /api/auth/signup — public, self-service. Creates a NEW company
// workspace, makes the signer its manager, and seeds it with sample data
// so they land in a working system. Their data is isolated from every
// other company from the first request.
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { email, password, name, company_name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Reject duplicates before creating a company, so a failed signup
    // doesn't leave an empty orphan company behind.
    const { data: existing } = await supabase
      .from('l_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
    if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

    const companyName = (company_name || '').trim() || `${name.trim()}'s Company`;
    const { data: company, error: companyErr } = await supabase
      .from('l_companies')
      .insert({ name: companyName, slug: await uniqueSlug(companyName) })
      .select('id, name, slug')
      .single();
    if (companyErr) throw companyErr;

    // Each company gets its own settings row (currency, payout, etc.).
    await supabase.from('l_settings').insert({ company_id: company.id });

    await seedDemoData(company.id);

    return createUser(
      { email, password, name, role: 'manager', companyId: company.id, company },
      res,
      next
    );
  } catch (err) {
    next(err);
  }
});

async function createUser({ email, password, name, role, companyId, company }, res, next) {
  try {
    const allowedRoles = ['manager', 'finance', 'viewer'];
    const finalRole = allowedRoles.includes(role) ? role : 'viewer';
    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('l_users')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash,
        name,
        role: finalRole,
        company_id: companyId,
      })
      .select('id, email, name, role, created_at, company_id')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
      throw error;
    }

    const token = signToken(data);
    res.status(201).json({ token, user: data, company: company || undefined });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const { data: user, error } = await supabase
      .from('l_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const { data: company } = await supabase
      .from('l_companies')
      .select('id, name, slug, logo_url')
      .eq('id', user.company_id)
      .maybeSingle();

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.created_at,
        company_id: user.company_id,
      },
      company,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data: company } = await supabase
      .from('l_companies')
      .select('id, name, slug, logo_url')
      .eq('id', req.user.company_id)
      .maybeSingle();
    res.json({ user: req.user, company });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/dev-login — INSTANT role switching for local testing only.
// Completely disabled unless DEV_MODE=true is set in .env. Issues a real
// token for a dedicated dev account (dev-manager@lintel.local etc.),
// creating that account the first time each role is requested, so the
// backend's actual authorization logic is exercised — not just the UI.
router.post('/dev-login', async (req, res, next) => {
  try {
    if (process.env.DEV_MODE !== 'true') {
      return res.status(404).json({ error: `Not found: POST /api/auth/dev-login` });
    }

    const { role } = req.body;
    const allowedRoles = ['manager', 'finance', 'viewer'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });
    }

    const email = `dev-${role}@lintel.local`;
    const { data: existing, error: findErr } = await supabase
      .from('l_users')
      .select('id, email, name, role, created_at, company_id')
      .eq('email', email)
      .maybeSingle();
    if (findErr) throw findErr;

    let user = existing;
    if (!user) {
      // Dev accounts join the default company so they exercise the same
      // scoping rules as a real user.
      const { data: company } = await supabase.from('l_companies').select('id').eq('slug', 'main').maybeSingle();
      const password_hash = await bcrypt.hash(`dev-${role}-${Date.now()}`, 10);
      const { data: created, error: createErr } = await supabase
        .from('l_users')
        .insert({
          email,
          password_hash,
          name: `Dev ${role.charAt(0).toUpperCase()}${role.slice(1)}`,
          role,
          company_id: company?.id,
        })
        .select('id, email, name, role, created_at, company_id')
        .single();
      if (createErr) throw createErr;
      user = created;
    }

    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/users — manager only, staff directory
router.get('/users', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_users')
      .select('id, email, name, role, created_at')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/users/:id — manager only, change a user's role.
// This is how a self-service signup (which always lands as `viewer`) gets
// promoted to real staff access.
router.patch('/users/:id', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const allowedRoles = ['manager', 'finance', 'viewer'];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${allowedRoles.join(', ')}` });
    }

    // Guard against locking the account out of its own administration: if
    // this is the last manager, don't let them demote themselves.
    if (req.user.id === id && role !== 'manager') {
      const { count, error: countErr } = await supabase
        .from('l_users')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', req.user.company_id)
        .eq('role', 'manager');
      if (countErr) throw countErr;
      if ((count || 0) <= 1) {
        return res.status(400).json({
          error: "You're the only manager — promote someone else before changing your own role.",
        });
      }
    }

    // The company_id filter is what stops a manager changing roles for
    // users belonging to a different company.
    const { data, error } = await supabase
      .from('l_users')
      .update({ role })
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select('id, email, name, role, created_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
