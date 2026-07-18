const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const router = express.Router();
router.use(gateMutations);


// GET /api/units?status=vacant&class=luxury
router.get('/', async (req, res, next) => {
  try {
    const { status, class: unitClass } = req.query;
    let query = supabase.from('l_units').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (unitClass) query = query.eq('class', unitClass);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('l_units').select('*').eq('id', id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      unit_code,
      property_name,
      unit_type,
      class: unitClass,
      bedrooms,
      bathrooms,
      address,
      city,
      base_rate_short,
      base_rate_long,
      status,
      notes,
      photo_url,
    } = req.body;

    if (!unit_code || !property_name || !unit_type) {
      return res.status(400).json({ error: 'unit_code, property_name and unit_type are required' });
    }

    const { data, error } = await supabase
      .from('l_units')
      .insert({
        unit_code,
        property_name,
        unit_type,
        class: unitClass || 'standard',
        bedrooms,
        bathrooms,
        address,
        city,
        base_rate_short,
        base_rate_long,
        status: status || 'vacant',
        notes,
        photo_url: photo_url || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.class === undefined && req.body.unitClass) updates.class = req.body.unitClass;

    const { data, error } = await supabase.from('l_units').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('l_units').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
