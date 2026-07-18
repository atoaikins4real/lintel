const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const router = express.Router();
router.use(gateMutations);


router.get('/', async (req, res, next) => {
  try {
    const { unit_id, category } = req.query;
    let query = supabase.from('l_expenses').select('*').order('expense_date', { ascending: false });
    if (unit_id) query = query.eq('unit_id', unit_id);
    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { unit_id, category, amount, expense_date, description } = req.body;
    if (!unit_id || !category || !amount || !expense_date) {
      return res.status(400).json({ error: 'unit_id, category, amount and expense_date are required' });
    }

    const { data, error } = await supabase
      .from('l_expenses')
      .insert({ unit_id, category, amount, expense_date, description })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('l_expenses').delete().eq('id', id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
