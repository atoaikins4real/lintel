// The subscriber's own company profile — business name, logo, contact
// details. Used on invoices/receipts and as the header of their public
// showcase page.
//
// Always operates on req.user.company_id; there is no way to address
// another company through these routes.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');
const { blank } = require('../utils/sanitize');

const router = express.Router();

// GET /api/company — any signed-in user in the company
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_companies')
      .select('*')
      .eq('id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Company not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/company — manager only
router.put('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { name, logo_url, email, phone, address, city, country, website, slug } = req.body;

    const updates = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Company name is required' });
      updates.name = String(name).trim();
    }
    for (const [key, value] of Object.entries({ logo_url, email, phone, address, city, country, website })) {
      if (value !== undefined) updates[key] = blank(value);
    }

    // The slug is part of the public showcase URL, so it has to stay
    // URL-safe and unique across all companies.
    if (slug !== undefined) {
      const clean = String(slug)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!clean) return res.status(400).json({ error: 'Showcase link must contain letters or numbers' });

      const { data: taken } = await supabase
        .from('l_companies')
        .select('id')
        .eq('slug', clean)
        .neq('id', req.user.company_id)
        .maybeSingle();
      if (taken) return res.status(409).json({ error: 'That showcase link is already taken — try another' });

      updates.slug = clean;
    }

    const { data, error } = await supabase
      .from('l_companies')
      .update(updates)
      .eq('id', req.user.company_id)
      .select()
      .single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
