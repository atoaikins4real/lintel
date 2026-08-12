const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
// See utils/sanitize.js — '' from an untouched form field is rejected by
// Postgres for integer/numeric columns and fails the whole insert.
const { blank, blank: str, toNumber: num } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);


// GET /api/units?status=vacant&class=luxury
router.get('/', async (req, res, next) => {
  try {
    const { status, class: unitClass } = req.query;
    let query = supabase.from('l_units').select('*').eq('company_id', req.user.company_id).order('created_at', { ascending: false });
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
    const { data, error } = await supabase.from('l_units').select('*').eq('id', id).eq('company_id', req.user.company_id).maybeSingle();
    if (!data) return res.status(404).json({ error: 'Unit not found' });
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
      property_id,
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
      photo_urls,
    } = req.body;

    if (!unit_code || !unit_type) {
      return res.status(400).json({ error: 'unit_code and unit_type are required' });
    }
    if (!property_id && !property_name) {
      return res.status(400).json({ error: 'Choose a property for this unit' });
    }

    // property_name is kept in step with the linked property so existing
    // views and the public showcase keep working without a join.
    let resolvedName = blank(property_name);
    let resolvedPropertyId = blank(property_id);

    if (resolvedPropertyId) {
      const { data: property, error: propErr } = await supabase
        .from('l_properties')
        .select('id, name')
        .eq('id', resolvedPropertyId)
        .eq('company_id', req.user.company_id)
        .maybeSingle();
      if (propErr) throw propErr;
      if (!property) return res.status(404).json({ error: 'Property not found' });
      resolvedName = property.name;
    } else {
      // No property chosen but a name was typed — create the property so
      // units are never orphaned from the new structure.
      const { data: created, error: createErr } = await supabase
        .from('l_properties')
        .upsert(
          { company_id: req.user.company_id, name: resolvedName, city: blank(city) },
          { onConflict: 'company_id,name' }
        )
        .select('id, name')
        .single();
      if (createErr) throw createErr;
      resolvedPropertyId = created.id;
      resolvedName = created.name;
    }

    const { data, error } = await supabase
      .from('l_units')
      .insert({
        company_id: req.user.company_id,
        unit_code,
        property_id: resolvedPropertyId,
        property_name: resolvedName,
        unit_type,
        class: unitClass || 'standard',
        bedrooms: num(bedrooms),
        bathrooms: num(bathrooms),
        address: str(address),
        city: str(city),
        base_rate_short: num(base_rate_short),
        base_rate_long: num(base_rate_long),
        status: status || 'vacant',
        notes: str(notes),
        photo_url: str(photo_url),
        // Was previously dropped on create entirely — gallery photos picked
        // on the new-unit form silently never saved.
        photo_urls: Array.isArray(photo_urls) ? photo_urls : [],
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
    delete updates.unitClass;

    // Same '' -> null coercion as on create (see num/str above).
    for (const field of ['bedrooms', 'bathrooms', 'base_rate_short', 'base_rate_long']) {
      if (field in updates) updates[field] = num(updates[field]);
    }
    for (const field of ['address', 'city', 'notes', 'photo_url']) {
      if (field in updates) updates[field] = str(updates[field]);
    }

    delete updates.company_id; // never reassignable from the request body

    // Moving a unit to another property re-syncs the denormalised name,
    // and confirms the target property belongs to this company.
    if (updates.property_id) {
      const { data: property, error: propErr } = await supabase
        .from('l_properties')
        .select('id, name')
        .eq('id', updates.property_id)
        .eq('company_id', req.user.company_id)
        .maybeSingle();
      if (propErr) throw propErr;
      if (!property) return res.status(404).json({ error: 'Property not found' });
      updates.property_name = property.name;
    }

    const { data, error } = await supabase
      .from('l_units')
      .update(updates)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Unit not found' });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('l_units').delete().eq('id', id).eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
