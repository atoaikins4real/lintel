const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);


router.get('/', async (req, res, next) => {
  try {
    const { unit_id, tenant_id, status } = req.query;
    let query = supabase.from('l_faults').select('*').order('reported_date', { ascending: false });
    if (unit_id) query = query.eq('unit_id', unit_id);
    if (tenant_id) query = query.eq('tenant_id', tenant_id);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { unit_id, tenant_id, description, severity, caused_by, reported_date, cost } = req.body;
    if (!unit_id || !description) {
      return res.status(400).json({ error: 'unit_id and description are required' });
    }

    const { data, error } = await supabase
      .from('l_faults')
      .insert({
        unit_id,
        tenant_id: blank(tenant_id),
        description,
        severity: severity || 'low',
        caused_by: caused_by || 'unknown',
        reported_date: blank(reported_date) || new Date().toISOString().slice(0, 10),
        cost: toNumber(cost),
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
    const updates = clean(req.body, {
      numbers: ['cost'],
      dates: ['reported_date', 'resolved_date'],
      texts: ['tenant_id', 'description'],
    });
    const { data, error } = await supabase.from('l_faults').update(updates).eq('id', id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
