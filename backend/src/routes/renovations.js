const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber } = require('../utils/sanitize');
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

module.exports = router;
