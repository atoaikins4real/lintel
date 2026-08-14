// Properties — a building or estate. Units belong to a property.
// Company-scoped like everything else: see backend/audit-scoping.js.
const express = require('express');
const { supabase } = require('../config/supabase');
const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');

const router = express.Router();
router.use(gateMutations);

const TEXTS = [
  'address', 'city', 'region', 'country', 'digital_address', 'description', 'photo_url', 'notes',
  // Building specifications — shown on the public showcase.
  'staircase_type', 'plot_size_unit', 'glass_panel_type', 'exterior_finish',
  'roofing_type', 'wall_material', 'water_source', 'power_backup',
];
const NUMBERS = [
  'year_built', 'floors', 'storeys', 'staircases', 'plot_size',
  'total_units', 'parking_spaces',
];

function arrayOf(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

// GET /api/properties — includes a unit count per property so the list
// page doesn't need a second round trip.
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_properties')
      .select('*, l_units(id, status)')
      .eq('company_id', req.user.company_id)
      .order('name', { ascending: true });
    if (error) throw error;

    const withCounts = (data || []).map(({ l_units, ...p }) => ({
      ...p,
      unit_count: (l_units || []).length,
      occupied_count: (l_units || []).filter((u) => u.status === 'occupied').length,
      vacant_count: (l_units || []).filter((u) => u.status === 'vacant').length,
    }));

    res.json(withCounts);
  } catch (err) {
    next(err);
  }
});

// GET /api/properties/:id — property plus its units
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_properties')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Property not found' });

    const { data: units } = await supabase
      .from('l_units')
      .select('*')
      .eq('property_id', req.params.id)
      .eq('company_id', req.user.company_id)
      .order('unit_code', { ascending: true });

    res.json({ ...data, units: units || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, property_type, amenities, photo_urls } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Property name is required' });
    }

    const payload = {
      name: String(name).trim(),
      property_type: property_type || 'apartment_block',
      amenities: arrayOf(amenities),
      photo_urls: arrayOf(photo_urls),
    };
    for (const f of TEXTS) payload[f] = blank(req.body[f]);
    for (const f of NUMBERS) payload[f] = toNumber(req.body[f]);

    const { data, error } = await supabase
      .from('l_properties')
      .insert({ ...payload, company_id: req.user.company_id })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'You already have a property with that name' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updates = clean(req.body, { numbers: NUMBERS, texts: TEXTS });
    delete updates.company_id;
    delete updates.id;
    if ('amenities' in updates) updates.amenities = arrayOf(updates.amenities);
    if ('photo_urls' in updates) updates.photo_urls = arrayOf(updates.photo_urls);
    if ('name' in updates) {
      if (!String(updates.name || '').trim()) return res.status(400).json({ error: 'Property name is required' });
      updates.name = String(updates.name).trim();
    }

    const { data, error } = await supabase
      .from('l_properties')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'You already have a property with that name' });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Property not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/properties/:id — refuses while units still reference it,
// so a building can't be removed out from under its apartments.
router.delete('/:id', async (req, res, next) => {
  try {
    const { count, error: countErr } = await supabase
      .from('l_units')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (countErr) throw countErr;

    if ((count || 0) > 0) {
      return res.status(409).json({
        error: `This property still has ${count} unit${count === 1 ? '' : 's'}. Move or delete them first.`,
      });
    }

    const { error } = await supabase
      .from('l_properties')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
