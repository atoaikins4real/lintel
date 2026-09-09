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
const paystack = require('../utils/paystack');
const { reconcilePaystackData } = require('../utils/reconcile');

const router = express.Router();

const TOKEN_TTL_DAYS = 30;

// A charge a tenant is allowed to pay online — not yet settled.
const PAYABLE_STATUSES = ['pending', 'late', 'partial'];

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

    const [{ data: tenant }, { data: leases }, { data: payments }, { data: units }, { data: company }, { data: portalSettings }] =
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
          .select('id, amount, currency, due_date, payment_date, status, method, reference, charge_type')
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
        supabase
          .from('l_settings')
          .select('online_payments_enabled, paystack_subaccount_code')
          .eq('company_id', record.company_id)
          .maybeSingle(),
      ]);

    if (!tenant) return invalid();

    // Whether a tenant can pay online here: the platform has Paystack keys,
    // AND this landlord has both enabled it and linked a settlement account.
    const onlinePayments = Boolean(
      paystack.isConfigured() && portalSettings?.online_payments_enabled && portalSettings?.paystack_subaccount_code
    );

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
      online_payments: onlinePayments,
    });
  } catch (err) {
    next(err);
  }
});

// Resolve a portal token to its live record, or null. Same rules as the
// statement route: must exist, not be revoked, not be expired.
async function resolveToken(rawToken) {
  if (!rawToken) return null;
  const { data: record } = await supabase
    .from('l_tenant_portal_tokens')
    .select('id, tenant_id, company_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle();
  if (!record || record.revoked_at) return null;
  if (new Date(record.expires_at) < new Date()) return null;
  return record;
}

// POST /api/tenant-portal/pay/initialize  { token, payment_id }
// Starts an online payment for ONE outstanding charge and returns the
// Paystack checkout URL the tenant completes on their phone. Money settles to
// the subscriber's own linked account (their Paystack subaccount), not Lintel.
router.post('/pay/initialize', portalLimiter, async (req, res, next) => {
  try {
    const record = await resolveToken(String(req.body?.token || ''));
    if (!record) return res.status(400).json({ error: 'This link is no longer valid. Please request a new one.' });

    const paymentId = String(req.body?.payment_id || '');
    if (!paymentId) return res.status(400).json({ error: 'Which charge would you like to pay?' });

    // The charge must belong to THIS tenant in THIS company. Scoping by both
    // is what stops a valid link paying (or probing) someone else's charge.
    const { data: payment } = await supabase
      .from('l_payments')
      .select('id, amount, currency, status, tenant_id')
      .eq('id', paymentId)
      .eq('company_id', record.company_id)
      .eq('tenant_id', record.tenant_id)
      .maybeSingle();

    if (!payment) return res.status(404).json({ error: 'Charge not found.' });
    if (!PAYABLE_STATUSES.includes(payment.status)) {
      return res.status(409).json({ error: 'This charge has already been paid.' });
    }

    // Is online payment actually available for this subscriber?
    if (!paystack.isConfigured()) {
      return res.status(503).json({ error: 'Online payment isn’t available yet. Please pay your landlord directly.' });
    }
    const { data: settings } = await supabase
      .from('l_settings')
      .select('online_payments_enabled, paystack_subaccount_code')
      .eq('company_id', record.company_id)
      .maybeSingle();
    if (!settings?.online_payments_enabled || !settings?.paystack_subaccount_code) {
      return res.status(503).json({ error: 'Your landlord hasn’t enabled online payments yet.' });
    }
    if (!paystack.currencySupported(payment.currency)) {
      return res.status(422).json({ error: `${payment.currency} can’t be paid online here. Please pay your landlord directly.` });
    }

    // Tenant's email is required by Paystack for the receipt.
    const { data: tenant } = await supabase
      .from('l_tenants')
      .select('email, first_name')
      .eq('id', record.tenant_id)
      .eq('company_id', record.company_id)
      .maybeSingle();
    if (!tenant?.email) {
      return res.status(422).json({ error: 'We need an email on your tenancy to take an online payment. Please contact your landlord.' });
    }

    const reference = `LX-${crypto.randomBytes(12).toString('hex')}`;

    let init;
    try {
      init = await paystack.initializeTransaction({
        email: tenant.email,
        amountMajor: payment.amount,
        currency: payment.currency,
        reference,
        // Paystack appends ?reference=&trxref= to this; the statement page
        // reads them and calls /pay/verify. The token is the tenant's own
        // link secret, already in their URL — carried through, not exposed anew.
        callbackUrl: `${mailer.APP_URL}/my-statement?token=${encodeURIComponent(String(req.body.token))}`,
        subaccount: settings.paystack_subaccount_code,
        metadata: { company_id: record.company_id, payment_id: payment.id, tenant_id: record.tenant_id },
      });
    } catch (gwErr) {
      // A gateway failure isn't a server bug — tell the tenant plainly.
      return res.status(502).json({ error: `Could not start the payment: ${gwErr.message}` });
    }

    const { error: txnErr } = await supabase.from('l_payment_transactions').insert({
      company_id: record.company_id,
      payment_id: payment.id,
      tenant_id: record.tenant_id,
      reference,
      amount: payment.amount,
      currency: payment.currency,
      status: 'initialized',
      authorization_url: init.authorization_url,
    });
    if (txnErr) throw txnErr;

    res.json({ authorization_url: init.authorization_url, reference });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenant-portal/pay/verify?token=&reference=
// Fallback to the webhook: when the tenant lands back on their statement,
// confirm the payment straight away rather than waiting for the async event.
// Reconciliation is idempotent, so racing the webhook is harmless.
router.get('/pay/verify', portalLimiter, async (req, res, next) => {
  try {
    const record = await resolveToken(String(req.query.token || ''));
    if (!record) return res.status(400).json({ error: 'This link is no longer valid. Please request a new one.' });

    const reference = String(req.query.reference || '');
    if (!reference) return res.status(400).json({ error: 'Missing payment reference.' });

    // The reference must be one WE started for THIS tenant — otherwise a link
    // holder could ask us to verify arbitrary references.
    const { data: txn } = await supabase
      .from('l_payment_transactions')
      .select('id, company_id, tenant_id, status')
      .eq('reference', reference)
      .eq('company_id', record.company_id)
      .eq('tenant_id', record.tenant_id)
      .maybeSingle();
    if (!txn) return res.status(404).json({ error: 'Payment not found.' });

    // Already settled by the webhook? Report success without re-hitting Paystack.
    if (txn.status === 'success') return res.json({ status: 'success' });

    let data;
    try {
      data = await paystack.verifyTransaction(reference);
    } catch (gwErr) {
      return res.status(502).json({ error: `Could not confirm the payment: ${gwErr.message}` });
    }

    const result = await reconcilePaystackData(data);
    const status = result.outcome === 'reconciled' || result.outcome === 'already_done' ? 'success'
      : result.outcome === 'mismatch' ? 'mismatch'
      : 'pending';
    res.json({ status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
