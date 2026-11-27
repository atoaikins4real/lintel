// Hotel room types & rate plans. A type groups rooms that share a size and
// price; each type carries one or more named rate plans (nightly prices) a
// reservation can be booked on. Reads are open to any signed-in user (so the
// room and reservation forms can list them); writes are manager-only.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const txt = (v) => { const s = String(v ?? '').trim(); return s || null; };

// GET /api/room-types — every type for this company, each with its rate plans.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_room_types')
      .select('*, l_rate_plans(*)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// POST /api/room-types — create a type plus a default "Standard" rate plan so
// it is bookable right away.
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const name = txt(req.body.name);
    if (!name) return res.status(400).json({ error: 'Give the room type a name' });
    const base_rate = num(req.body.base_rate);
    const { data: type, error } = await supabase
      .from('l_room_types')
      .insert({
        company_id: req.user.company_id,
        name,
        base_rate,
        capacity: num(req.body.capacity),
        description: txt(req.body.description),
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('l_rate_plans').insert({
      company_id: req.user.company_id, room_type_id: type.id, name: 'Standard', price: base_rate ?? 0,
    });

    const { data: full } = await supabase
      .from('l_room_types').select('*, l_rate_plans(*)').eq('id', type.id).single();
    res.status(201).json(full || type);
  } catch (err) { next(err); }
});

// PUT /api/room-types/:id
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const n = txt(req.body.name);
      if (!n) return res.status(400).json({ error: 'Give the room type a name' });
      updates.name = n;
    }
    if (req.body.base_rate !== undefined) updates.base_rate = num(req.body.base_rate);
    if (req.body.capacity !== undefined) updates.capacity = num(req.body.capacity);
    if (req.body.description !== undefined) updates.description = txt(req.body.description);

    const { data, error } = await supabase
      .from('l_room_types').update(updates)
      .eq('id', req.params.id).eq('company_id', req.user.company_id)
      .select('*, l_rate_plans(*)').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Room type not found' });
    res.json(data);
  } catch (err) { next(err); }
});

// DELETE /api/room-types/:id — rooms fall back to no type (FK ON DELETE SET
// NULL); the type's rate plans cascade away.
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_room_types').delete()
      .eq('id', req.params.id).eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) { next(err); }
});

// --- Rate plans (named nightly prices under a type) -----------------------
// Two-segment paths, so they never collide with /:id above.

router.post('/:id/rate-plans', requireRole('manager'), async (req, res, next) => {
  try {
    const name = txt(req.body.name);
    const price = num(req.body.price);
    if (!name) return res.status(400).json({ error: 'Give the rate plan a name' });
    if (price === null) return res.status(400).json({ error: 'Give the rate plan a price' });

    const { data: type } = await supabase
      .from('l_room_types').select('id')
      .eq('id', req.params.id).eq('company_id', req.user.company_id).maybeSingle();
    if (!type) return res.status(404).json({ error: 'Room type not found' });

    const { data, error } = await supabase
      .from('l_rate_plans')
      .insert({ company_id: req.user.company_id, room_type_id: req.params.id, name, price, notes: txt(req.body.notes) })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/rate-plans/:planId', requireRole('manager'), async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const n = txt(req.body.name);
      if (!n) return res.status(400).json({ error: 'Give the rate plan a name' });
      updates.name = n;
    }
    if (req.body.price !== undefined) {
      const p = num(req.body.price);
      if (p === null) return res.status(400).json({ error: 'Give the rate plan a price' });
      updates.price = p;
    }
    if (req.body.notes !== undefined) updates.notes = txt(req.body.notes);

    const { data, error } = await supabase
      .from('l_rate_plans').update(updates)
      .eq('id', req.params.planId).eq('company_id', req.user.company_id)
      .select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Rate plan not found' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/rate-plans/:planId', requireRole('manager'), async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_rate_plans').delete()
      .eq('id', req.params.planId).eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
