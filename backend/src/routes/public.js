// Public showcase + booking-inquiry endpoints — deliberately mounted
// BEFORE the requireAuth gate in app.js, since these are meant to be
// shared on social media and hit by strangers with no Lintel account.
// Only ever exposes a safe subset of unit fields (no address, no internal
// notes) and never touches tenant/lease/payment data.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { supabase } = require('../config/supabase');

const router = express.Router();

// Spam prevention, not brute-force prevention (there's no secret being
// guessed here) — a bit more generous than the auth limiter.
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

// address and notes are deliberately excluded — street-level address and
// internal staff notes have no business being public.
const PUBLIC_UNIT_FIELDS =
  'id, unit_code, property_name, unit_type, class, bedrooms, bathrooms, city, base_rate_short, base_rate_long, photo_url, photo_urls, status';

// The showcase pages are public, so they can't read the authenticated
// settings endpoint — send the display currency along with the listings.
async function defaultCurrency() {
  const { data } = await supabase.from('l_settings').select('default_currency').limit(1).single();
  return data?.default_currency || 'GHS';
}

// GET /api/public/units — the portfolio-wide showcase grid.
router.get('/units', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_units')
      .select(PUBLIC_UNIT_FIELDS)
      .neq('status', 'off_market')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ units: data, currency: await defaultCurrency() });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/units/:id — a single unit's showcase page.
router.get('/units/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('l_units')
      .select(PUBLIC_UNIT_FIELDS)
      .eq('id', id)
      .neq('status', 'off_market')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Listing not found' });
    res.json({ ...data, currency: await defaultCurrency() });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/units/:id/inquiries — "Book now" submission. Creates a
// pending inquiry for staff to review; never touches leases directly.
router.post('/units/:id/inquiries', inquiryLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, start_date, end_date, message } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({ error: 'Provide an email or phone number so we can reach you' });
    }

    const { data: unit, error: unitErr } = await supabase
      .from('l_units')
      .select('id')
      .eq('id', id)
      .neq('status', 'off_market')
      .single();
    if (unitErr || !unit) return res.status(404).json({ error: 'Listing not found' });

    const { data, error } = await supabase
      .from('l_booking_inquiries')
      .insert({
        unit_id: id,
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
