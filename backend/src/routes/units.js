const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
// See utils/sanitize.js — '' from an untouched form field is rejected by
// Postgres for integer/numeric columns and fails the whole insert.
const { blank, blank: str, toNumber: num } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);

// Apartment specification fields. Kept as single lists so create and
// update can never drift apart.
const SPEC_NUMBERS = [
  'bedrooms', 'bathrooms', 'base_rate_short', 'base_rate_long',
  'floor_area', 'floor_number', 'storeys', 'staircases', 'rooms',
  'kitchens', 'halls', 'balconies', 'ensuite_bathrooms', 'store_rooms',
  'sale_price',
];
const SPEC_TEXTS = [
  'address', 'city', 'notes', 'photo_url', 'description',
  'floor_area_unit', 'glass_panel_type', 'wood_colour', 'joinery_material',
  'flooring_type', 'ceiling_type', 'wall_colour', 'view_orientation',
  'sale_currency',
];
const FURNISHING = ['unfurnished', 'semi_furnished', 'fully_furnished'];
const LISTING_TYPES = ['rent', 'sale', 'both'];
const SALE_STATUSES = ['available', 'under_offer', 'sold'];

/**
 * Validates the sale fields and keeps them coherent: a unit offered for
 * sale needs a sale_status, and one that isn't for sale shouldn't carry
 * sale data that would then surface on the public listing.
 */
function applySaleFields(target, body) {
  if (body.listing_type !== undefined) {
    if (!LISTING_TYPES.includes(body.listing_type)) {
      return `Listing type must be one of: ${LISTING_TYPES.join(', ')}`;
    }
    target.listing_type = body.listing_type;
  }
  if (body.sale_status !== undefined && body.sale_status !== '' && body.sale_status !== null) {
    if (!SALE_STATUSES.includes(body.sale_status)) {
      return `Sale status must be one of: ${SALE_STATUSES.join(', ')}`;
    }
    target.sale_status = body.sale_status;
  }

  const forSale = ['sale', 'both'].includes(target.listing_type);
  if (target.listing_type !== undefined) {
    if (forSale) {
      // Default the status so a for-sale unit is never in limbo.
      if (!target.sale_status) target.sale_status = 'available';
    } else {
      // Reverting to rent-only clears sale data rather than leaving a
      // stale asking price that could reappear on the showcase later.
      target.sale_status = null;
      target.sale_price = null;
    }
  }
  return null;
}


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

    // Build the specification fields from the same lists the update path
    // uses, so a new field can never be accepted on edit but dropped on
    // create (which is exactly how photo_urls went missing before).
    const spec = {};
    for (const f of SPEC_NUMBERS) spec[f] = num(req.body[f]);
    for (const f of SPEC_TEXTS) spec[f] = str(req.body[f]);
    if (req.body.furnishing && FURNISHING.includes(req.body.furnishing)) {
      spec.furnishing = req.body.furnishing;
    }
    if (req.body.has_air_conditioning !== undefined && req.body.has_air_conditioning !== null) {
      spec.has_air_conditioning = Boolean(req.body.has_air_conditioning);
    }

    const saleError = applySaleFields(spec, req.body);
    if (saleError) return res.status(400).json({ error: saleError });

    const { data, error } = await supabase
      .from('l_units')
      .insert({
        ...spec,
        company_id: req.user.company_id,
        unit_code,
        property_id: resolvedPropertyId,
        property_name: resolvedName,
        unit_type,
        class: unitClass || 'standard',
        status: status || 'vacant',
        // Was previously dropped on create entirely — gallery photos picked
        // on the new-unit form silently never saved.
        photo_urls: Array.isArray(photo_urls) ? photo_urls : [],
        features: Array.isArray(req.body.features) ? req.body.features : [],
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
    for (const field of SPEC_NUMBERS) {
      if (field in updates) updates[field] = num(updates[field]);
    }
    for (const field of SPEC_TEXTS) {
      if (field in updates) updates[field] = str(updates[field]);
    }
    if ('features' in updates) {
      updates.features = Array.isArray(updates.features) ? updates.features : [];
    }
    if ('has_air_conditioning' in updates && updates.has_air_conditioning !== null) {
      updates.has_air_conditioning = Boolean(updates.has_air_conditioning);
    }
    // Empty string isn't a valid enum value.
    if ('furnishing' in updates) updates.furnishing = str(updates.furnishing);

    const saleError = applySaleFields(updates, req.body);
    if (saleError) return res.status(400).json({ error: saleError });

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
