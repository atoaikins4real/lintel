const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// GET /api/auth/bootstrap-status — lets the frontend know whether to show
// "create your manager account" (no users yet) or the normal login form.
router.get('/bootstrap-status', async (req, res, next) => {
  try {
    const { count, error } = await supabase.from('l_users').select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ needsBootstrap: (count || 0) === 0 });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/register
// While l_users is empty, this is open and always creates a manager
// (first-run bootstrap). Once any user exists, creating more accounts
// requires being logged in as a manager.
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { count, error: countErr } = await supabase.from('l_users').select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;
    const isBootstrap = (count || 0) === 0;

    if (!isBootstrap) {
      // Not the first account — require a logged-in manager to create more staff.
      return requireAuth(req, res, () =>
        requireRole('manager')(req, res, () => createUser({ email, password, name, role }, res, next))
      );
    }

    return createUser({ email, password, name: name, role: 'manager' }, res, next);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/signup — public, self-service. This is how a prospect
// creates their own account to try Lintel without asking anyone for
// access. It ALWAYS creates a `viewer` (read-only) account — the role
// field is never read from the request body, so there's no way to sign
// yourself up as manager/finance this way. Same shared demo dataset
// every other viewer sees; nothing a signup account does can change data,
// so this is safe to leave open to the public internet.
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    return createUser({ email, password, name, role: 'viewer' }, res, next);
  } catch (err) {
    next(err);
  }
});

async function createUser({ email, password, name, role }, res, next) {
  try {
    const allowedRoles = ['manager', 'finance', 'viewer'];
    const finalRole = allowedRoles.includes(role) ? role : 'viewer';
    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('l_users')
      .insert({ email: email.toLowerCase().trim(), password_hash, name, role: finalRole })
      .select('id, email, name, role, created_at')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
      throw error;
    }

    const token = signToken(data);
    res.status(201).json({ token, user: data });
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

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, created_at: user.created_at },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
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
      .select('id, email, name, role, created_at')
      .eq('email', email)
      .maybeSingle();
    if (findErr) throw findErr;

    let user = existing;
    if (!user) {
      const password_hash = await bcrypt.hash(`dev-${role}-${Date.now()}`, 10);
      const { data: created, error: createErr } = await supabase
        .from('l_users')
        .insert({ email, password_hash, name: `Dev ${role.charAt(0).toUpperCase()}${role.slice(1)}`, role })
        .select('id, email, name, role, created_at')
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
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
