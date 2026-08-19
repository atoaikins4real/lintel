const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);

// Must match the l_expense_category enum. Validated here so a bad value
// returns a readable message instead of a raw Postgres enum error.
const CATEGORIES = ['utilities', 'maintenance', 'management_fee', 'insurance', 'tax', 'cleaning', 'other'];

/**
 * Confirms the unit belongs to the caller's company.
 *
 * The composite foreign key already makes a cross-company expense
 * impossible at the database, so this is not the security boundary — it
 * exists to turn an opaque constraint violation into a clear 404.
 */
async function unitInCompany(unitId, companyId) {
  const { data } = await supabase
    .from('l_units')
    .select('id')
    .eq('id', unitId)
    .eq('company_id', companyId)
    .maybeSingle();
  return Boolean(data);
}

router.get('/', async (req, res, next) => {
  try {
    const { unit_id, category } = req.query;
    let query = supabase.from('l_expenses').select('*').eq('company_id', req.user.company_id).order('expense_date', { ascending: false });
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
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (!(await unitInCompany(unit_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    const { data, error } = await supabase
      .from('l_expenses')
      .insert({ company_id: req.user.company_id, unit_id, category, amount: toNumber(amount), expense_date, description: blank(description) })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// There was no update route at all, so a mistyped amount could only be
// deleted and re-entered — losing the original date in the process.
router.put('/:id', async (req, res, next) => {
  try {
    const updates = clean(req.body, {
      numbers: ['amount'],
      dates: ['expense_date'],
      texts: ['description'],
    });
    delete updates.company_id; // never reassignable from the request body
    delete updates.id;

    if ('category' in updates && !CATEGORIES.includes(updates.category)) {
      return res.status(400).json({ error: `Category must be one of: ${CATEGORIES.join(', ')}` });
    }
    if (updates.unit_id && !(await unitInCompany(updates.unit_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Apartment not found' });
    }

    const { data, error } = await supabase
      .from('l_expenses')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Expense not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('l_expenses').delete().eq('id', id).eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
