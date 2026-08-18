const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);


router.get('/', async (req, res, next) => {
  try {
    const { unit_id } = req.query;
    let query = supabase.from('l_renovations').select('*').eq('company_id', req.user.company_id).order('start_date', { ascending: false });
    if (unit_id) query = query.eq('unit_id', unit_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { unit_id, description, cost, start_date, end_date, rate_before, rate_after } = req.body;
    if (!unit_id || !description || !cost) {
      return res.status(400).json({ error: 'unit_id, description and cost are required' });
    }

    const { data, error } = await supabase
      .from('l_renovations')
      .insert({
        company_id: req.user.company_id,
        unit_id,
        description,
        cost: toNumber(cost),
        start_date: blank(start_date),
        end_date: blank(end_date),
        rate_before: toNumber(rate_before),
        rate_after: toNumber(rate_after),
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// Renovations have no dependants, so both editing and deleting are safe.
router.put('/:id', async (req, res, next) => {
  try {
    const updates = clean(req.body, {
      numbers: ['cost', 'rate_before', 'rate_after'],
      dates: ['start_date', 'end_date'],
      texts: ['description'],
    });
    delete updates.company_id;

    const { data, error } = await supabase
      .from('l_renovations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Renovation not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_renovations')
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
