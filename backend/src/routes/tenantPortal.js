// TENANT PORTAL
//
// Lets a tenant see their own statement without an account. They enter
// their email on a public page, receive a link, and that link shows only
// their own record.
//
// Why no tenant login: tenants aren't staff. Giving them passwords would
// add a second authentication surface to defend, more resets to support,
// and another route into a company's workspace. A scoped, expiring link
// that reveals exactly one tenant's statement is far less to get wrong.
//
// Mounted BEFORE requireAuth in app.js — there is no session here. The
// token in the URL is the entire authorisation, so it's treated with the
// same care as a password reset: hashed at rest, expiring, revocable.
//
// NOTE for audit-scoping.js: queries here derive company_id from the
// token record rather than a session, and the allow-list names this file
// with that reason.
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const mailer = require('../utils/mailer');

const router = express.Router();

const TOKEN_TTL_DAYS = 30;

const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.headers['x-nf-client-connection-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown',
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// POST /api/tenant-portal/request  { email }
// Always replies the same way, so this can't be used to discover which
// email addresses are tenants of which company.
router.post('/request', portalLimiter, async (req, res, next) => {
  const genericReply = () =>
    res.json({
      message: "If that email is on a tenancy, we've sent a link to view your statement.",
    });

  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Enter your email address' });

    // A person could in principle be a tenant of more than one company —
    // each gets its own link, since each statement is separate.
    const { data: tenants } = await supabase
      .from('l_tenants')
      .select('id, company_id, first_name, email, l_companies(name)')
      .eq('email', email);

    if (!tenants?.length) return genericReply();

    for (const tenant of tenants) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000);

      const { error: insertErr } = await supabase.from('l_tenant_portal_tokens').insert({
        company_id: tenant.company_id,
        tenant_id: tenant.id,
        token_hash: hashToken(rawToken),
        expires_at: expiresAt.toISOString(),
      });
      if (insertErr) throw insertErr;

      const url = `${mailer.APP_URL}/my-statement?token=${rawToken}`;
      await mailer.send({
        to: tenant.email,
        subject: `Your statement from ${tenant.l_companies?.name || 'your landlord'}`,
        text: `Hi ${tenant.first_name}, view your statement here (valid for ${TOKEN_TTL_DAYS} days): ${url}`,
        html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
          <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
            <h1 style="font-size:20px;margin:0 0 14px">Your statement</h1>
            <p style="line-height:1.6">Hi ${tenant.first_name},</p>
            <p style="line-height:1.6">Use the button below to view your tenancy and payment history from
              ${tenant.l_companies?.name || 'your landlord'}. The link works for ${TOKEN_TTL_DAYS} days.</p>
            <p style="margin:22px 0"><a href="${url}" style="background:#1c1917;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;display:inline-block">View my statement</a></p>
            <p style="font-size:12px;color:#78716c;line-height:1.5">If the button doesn't work, paste this into your browser:<br>${url}</p>
            <p style="font-size:13px;color:#78716c;line-height:1.6">If you didn't request this, you can ignore this email.</p>
          </div></body></html>`,
      });
    }

    return genericReply();
  } catch (err) {
    next(err);
  }
});

// GET /api/tenant-portal/statement?token=...
// Read-only. A tenant can see their own tenancies and payments and
// nothing else — no other tenants, no unit costs, no company finances.
router.get('/statement', portalLimiter, async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).json({ error: 'Missing link token' });

    const { data: record } = await supabase
      .from('l_tenant_portal_tokens')
      .select('id, tenant_id, company_id, expires_at, revoked_at')
      .eq('token_hash', hashToken(token))
      .maybeSingle();

    // One message for missing, revoked and expired.
    const invalid = () =>
      res.status(400).json({ error: 'This link is no longer valid. Please request a new one.' });

    if (!record) return invalid();
    if (record.revoked_at) return invalid();
    if (new Date(record.expires_at) < new Date()) return invalid();

    // Record activity without burning the link — a tenant may reasonably
    // open their statement more than once.
    await supabase
      .from('l_tenant_portal_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', record.id);

    const [{ data: tenant }, { data: leases }, { data: payments }, { data: units }, { data: company }] =
      await Promise.all([
        supabase
          .from('l_tenants')
          .select('id, lintel_id, first_name, last_name, email, phone')
          .eq('id', record.tenant_id)
          .eq('company_id', record.company_id)
          .maybeSingle(),
        supabase
          .from('l_leases')
          .select('unit_id, stay_type, start_date, end_date, agreed_rate, rate_period, status')
          .eq('tenant_id', record.tenant_id)
          .eq('company_id', record.company_id),
        supabase
          .from('l_payments')
          .select('amount, currency, due_date, payment_date, status, method, reference')
          .eq('tenant_id', record.tenant_id)
          .eq('company_id', record.company_id)
          .order('due_date', { ascending: true }),
        supabase
          .from('l_units')
          .select('id, unit_code, property_name')
          .eq('company_id', record.company_id),
        supabase
          .from('l_companies')
          .select('name, email, phone, address, city, country, logo_url')
          .eq('id', record.company_id)
          .maybeSingle(),
      ]);

    if (!tenant) return invalid();

    const unitById = Object.fromEntries((units || []).map((u) => [u.id, u]));

    const charged = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const paid = (payments || [])
      .filter((p) => p.status === 'paid')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const outstanding = (payments || [])
      .filter((p) => ['pending', 'late', 'partial'].includes(p.status))
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    res.json({
      company,
      tenant,
      leases: (leases || []).map((l) => ({
        ...l,
        unit: unitById[l.unit_id]?.unit_code || '—',
        property: unitById[l.unit_id]?.property_name || '—',
        unit_id: undefined,
      })),
      payments: payments || [],
      totals: { charged, paid, outstanding },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
