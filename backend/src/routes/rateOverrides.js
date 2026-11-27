// Seasonal pricing & minimum-stay for listings. An override covers a date range
// for one listing with a nightly rate and/or a minimum number of nights. Reads
// are open to any signed-in user (the listing page and the booking form read
// them); writes are manager-only.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const txt = (v) => { const s = String(v ?? '').trim(); return s || null; };
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// GET /api/rate-overrides?unit_id= — overrides for a listing (or the whole
// company when no unit is given), soonest first.
router.get('/', async (req, res, next) => {
  try {
    let query = supabase
      .from('l_rate_overrides')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('start_date', { ascending: true });
    if (req.query.unit_id) query = query.eq('unit_id', req.query.unit_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { unit_id } = req.body;
    const start_date = txt(req.body.start_date);
    const end_date = txt(req.body.end_date);
    if (!unit_id) return res.status(400).json({ error: 'Choose a listing' });
    if (!isDate(start_date) || !isDate(end_date)) return res.status(400).json({ error: 'Give a start and end date' });
    if (end_date < start_date) return res.status(400).json({ error: 'End date must be on or after the start date' });

    // The listing must belong to this company.
    const { data: unit } = await supabase
      .from('l_units').select('id').eq('id', unit_id).eq('company_id', req.user.company_id).maybeSingle();
    if (!unit) return res.status(404).json({ error: 'Listing not found' });

    const { data, error } = await supabase
      .from('l_rate_overrides')
      .insert({
        company_id: req.user.company_id,
        unit_id,
        label: txt(req.body.label),
        start_date,
        end_date,
        nightly_rate: num(req.body.nightly_rate),
        min_stay: num(req.body.min_stay),
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.label !== undefined) updates.label = txt(req.body.label);
    if (req.body.start_date !== undefined) {
      if (!isDate(req.body.start_date)) return res.status(400).json({ error: 'Invalid start date' });
      updates.start_date = req.body.start_date;
    }
    if (req.body.end_date !== undefined) {
      if (!isDate(req.body.end_date)) return res.status(400).json({ error: 'Invalid end date' });
      updates.end_date = req.body.end_date;
    }
    if (req.body.nightly_rate !== undefined) updates.nightly_rate = num(req.body.nightly_rate);
    if (req.body.min_stay !== undefined) updates.min_stay = num(req.body.min_stay);
    if (updates.start_date && updates.end_date && updates.end_date < updates.start_date) {
      return res.status(400).json({ error: 'End date must be on or after the start date' });
    }

    const { data, error } = await supabase
      .from('l_rate_overrides').update(updates)
      .eq('id', req.params.id).eq('company_id', req.user.company_id)
      .select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Rate not found' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_rate_overrides').delete()
      .eq('id', req.params.id).eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
