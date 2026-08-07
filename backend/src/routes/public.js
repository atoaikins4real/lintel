// Public showcase + booking-inquiry endpoints — mounted BEFORE the
// requireAuth gate in app.js, since these are meant to be shared on social
// media and hit by strangers with no Lintel account.
//
// Multi-tenancy note: there's no session here, so the company is
// identified by the slug in the URL (/api/public/:slug/...). Every query
// is still scoped to exactly one company — a visitor can only ever see the
// listings of the company whose link they followed.
//
// Only a safe subset of unit fields is exposed (no street address, no
// internal notes) and no tenant, lease or payment data is reachable.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');

const router = express.Router();

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.headers['x-nf-client-connection-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown',
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

const PUBLIC_UNIT_FIELDS =
  'id, unit_code, property_name, unit_type, class, bedrooms, bathrooms, city, base_rate_short, base_rate_long, photo_url, photo_urls, status';

// Resolves the slug to a company, or null. Everything below refuses to
// return data without one.
async function companyBySlug(slug) {
  const { data } = await supabase
    .from('l_companies')
    .select('id, name, slug, logo_url, phone, email, city, country, website')
    .eq('slug', slug)
    .maybeSingle();
  return data || null;
}

async function currencyFor(companyId) {
  const { data } = await supabase
    .from('l_settings')
    .select('default_currency')
    .eq('company_id', companyId)
    .maybeSingle();
  return data?.default_currency || 'GHS';
}

// GET /api/public/:slug/units — one company's showcase grid.
router.get('/:slug/units', async (req, res, next) => {
  try {
    const company = await companyBySlug(req.params.slug);
    if (!company) return res.status(404).json({ error: 'Showcase not found' });

    const { data, error } = await supabase
      .from('l_units')
      .select(PUBLIC_UNIT_FIELDS)
      .eq('company_id', company.id)
      .neq('status', 'off_market')
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ units: data, company, currency: await currencyFor(company.id) });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/:slug/units/:id — a single listing.
router.get('/:slug/units/:id', async (req, res, next) => {
  try {
    const company = await companyBySlug(req.params.slug);
    if (!company) return res.status(404).json({ error: 'Showcase not found' });

    const { data, error } = await supabase
      .from('l_units')
      .select(PUBLIC_UNIT_FIELDS)
      .eq('id', req.params.id)
      .eq('company_id', company.id)
      .neq('status', 'off_market')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Listing not found' });

    res.json({ ...data, company, currency: await currencyFor(company.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/:slug/units/:id/inquiries — "Book now" submission.
router.post('/:slug/units/:id/inquiries', inquiryLimiter, async (req, res, next) => {
  try {
    const company = await companyBySlug(req.params.slug);
    if (!company) return res.status(404).json({ error: 'Showcase not found' });

    const { name, email, phone, start_date, end_date, message } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({ error: 'Provide an email or phone number so we can reach you' });
    }

    // Confirms the unit belongs to THIS company — stops someone pointing a
    // valid slug at another company's unit id.
    const { data: unit, error: unitErr } = await supabase
      .from('l_units')
      .select('id')
      .eq('id', req.params.id)
      .eq('company_id', company.id)
      .neq('status', 'off_market')
      .maybeSingle();
    if (unitErr) throw unitErr;
    if (!unit) return res.status(404).json({ error: 'Listing not found' });

    const { data, error } = await supabase
      .from('l_booking_inquiries')
      .insert({
        company_id: company.id,
        unit_id: unit.id,
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        start_date: start_date || null,
        end_date: end_date || null,
        message: message?.trim() || null,
      })
      .select('id, created_at')
      .single();
    if (error) throw error;

    res.status(201).json({ id: data.id, created_at: data.created_at });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
