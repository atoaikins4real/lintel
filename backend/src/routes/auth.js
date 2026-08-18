const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mailer = require('../utils/mailer');
const { supabase } = require('../config/supabase');
const { signToken, requireAuth, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { seedDemoData } = require('../utils/seedDemoData');
const { enforceSubscription } = require('../middleware/subscription');
const { enforcePlanLimit } = require('../middleware/planLimits');

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
// enforceSubscription and enforcePlanLimit are applied here explicitly:
// this router mounts before the global gates in app.js (because login and
// signup must stay reachable), so staff creation would otherwise escape
// both the lapsed-subscription check and the max_staff limit.
router.post(
  '/register',
  authLimiter,
  requireAuth,
  requireRole('manager'),
  enforceSubscription,
  enforcePlanLimit('staff'),
  async (req, res, next) => {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    // Email the new colleague their credentials. Best-effort: if mail
    // isn't configured the account is still created and the manager can
    // pass the password on directly, exactly as before.
    const { data: company } = await supabase
      .from('l_companies')
      .select('name')
      .eq('id', req.user.company_id)
      .maybeSingle();

    if (String(email).includes('@')) {
      mailer.send({
        to: email,
        ...mailer.templates.staffInvite({
          name,
          companyName: company?.name || 'your team',
          email,
          password,
          loginUrl: `${mailer.APP_URL}/login`,
        }),
      });
    }

    return createUser({ email, password, name, role, companyId: req.user.company_id }, res, next);
  }
);

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

    // Start the trial clock. The length comes from the plan catalogue
    // rather than a hardcoded number, so changing the trial period is a
    // data change, not a code change.
    const { data: trialPlan } = await supabase
      .from('l_plans')
      .select('id, trial_days')
      .eq('code', 'trial')
      .maybeSingle();

    const trialDays = trialPlan?.trial_days ?? 30;
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + trialDays);

    await supabase.from('l_subscriptions').insert({
      company_id: company.id,
      plan_id: trialPlan?.id || null,
      status: 'trial',
      started_on: new Date().toISOString().slice(0, 10),
      trial_ends_on: trialEnds.toISOString().slice(0, 10),
    });

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

// There was once a POST /api/auth/dev-login here — an unauthenticated
// route that minted a real manager token for the 'main' company so roles
// could be switched instantly while developing. It was gated behind
// DEV_MODE=true, but a gate is only as good as the environment it runs
// in: a single stray env var on the host would have turned it into a
// complete authentication bypass into the operator's own workspace.
// Deleted outright before opening the app to external testers. Do not
// reintroduce it — use a real account, or seed one directly in the
// database, so no shipped code path can ever issue a token without a
// password.

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

// ---------------------------------------------------------------------
// PASSWORD RESET
//
// Replaces the previous "ask your manager" dead end. Design notes:
//  - The response is identical whether or not the address exists, so this
//    can't be used to discover who has an account.
//  - Only a hash of the token is stored; the raw value lives only in the
//    emailed link, so a database leak can't be used to reset passwords.
//  - Tokens expire and are single-use.
//  - Rate limited, since it sends mail on demand.
// ---------------------------------------------------------------------
const RESET_TTL_MINUTES = 60;

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  // Same reply in every branch below.
  const genericReply = () =>
    res.json({
      message: "If that account exists, we've sent a reset link. Check your inbox and spam folder.",
    });

  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Enter your email or username' });

    const { data: user } = await supabase
      .from('l_users')
      .select('id, name, email')
      .eq('email', email)
      .maybeSingle();

    // Unknown address: reply as though it worked.
    if (!user) return genericReply();

    // An account created with a username rather than an email address has
    // nowhere to send to. Still reply generically.
    if (!user.email.includes('@')) return genericReply();

    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

    const { error: insertErr } = await supabase.from('l_password_resets').insert({
      user_id: user.id,
      token_hash: hashToken(rawToken),
      expires_at: expiresAt.toISOString(),
      requested_ip:
        req.headers['x-nf-client-connection-ip'] ||
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        null,
    });
    if (insertErr) throw insertErr;

    const resetUrl = `${mailer.APP_URL}/reset-password?token=${rawToken}`;
    await mailer.send({
      to: user.email,
      ...mailer.templates.passwordReset({
        name: user.name,
        resetUrl,
        expiresMinutes: RESET_TTL_MINUTES,
      }),
    });

    return genericReply();
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const { data: record } = await supabase
      .from('l_password_resets')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', hashToken(String(token)))
      .maybeSingle();

    // One message for invalid, already-used and expired, so probing tells
    // an attacker nothing.
    const invalid = () =>
      res.status(400).json({ error: 'That reset link is invalid or has expired. Please request a new one.' });

    if (!record) return invalid();
    if (record.used_at) return invalid();
    if (new Date(record.expires_at) < new Date()) return invalid();

    const password_hash = await bcrypt.hash(String(password), 10);

    const { error: updateErr } = await supabase
      .from('l_users')
      .update({ password_hash })
      .eq('id', record.user_id);
    if (updateErr) throw updateErr;

    // Burn this token, and any other outstanding ones for the same user —
    // resetting the password should invalidate every pending request.
    await supabase
      .from('l_password_resets')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', record.user_id)
      .is('used_at', null);

    res.json({ message: 'Your password has been changed. You can sign in with it now.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/users/:id — remove a staff account (manager only).
// This is how an ex-employee loses access; previously roles could be
// changed but accounts never revoked.
router.delete('/users/:id', requireAuth, requireRole('manager'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Deleting yourself would immediately invalidate your own session and
    // could orphan the company's administration.
    if (req.user.id === id) {
      return res.status(400).json({ error: "You can't remove your own account. Ask another manager to do it." });
    }

    const { data: target } = await supabase
      .from('l_users')
      .select('id, role')
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Never leave a company with no manager.
    if (target.role === 'manager') {
      const { count } = await supabase
        .from('l_users')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', req.user.company_id)
        .eq('role', 'manager');
      if ((count || 0) <= 1) {
        return res.status(400).json({
          error: 'That is the only manager on this account — promote someone else before removing them.',
        });
      }
    }

    const { error } = await supabase
      .from('l_users')
      .delete()
      .eq('id', id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
