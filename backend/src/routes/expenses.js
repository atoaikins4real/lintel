const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);

// Real columns on the table. Anything else in the request body is
// dropped rather than sent to Postgres — detail endpoints return
// joined children (a property's `units`, a lease's `payments`) and
// edit forms send the whole object back. See utils/sanitize.js.
const COLUMNS = [
  'unit_id',
  'category_id',
  'amount',
  'expense_date',
  'description',
];

// `category` (the old enum) is deliberately absent from COLUMNS. Each
// company now owns its own category list in l_expense_categories, so an
// expense points at a row rather than a shared enum value. The enum
// column still exists and still holds the original value for pre-existing
// rows, but nothing writes to it.

/** Confirms a category belongs to the caller's company. */
async function categoryInCompany(categoryId, companyId) {
  const { data } = await supabase
    .from('l_expense_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('company_id', companyId)
    .maybeSingle();
  return Boolean(data);
}

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

// ---------------------------------------------------------------------
// CATEGORIES — one list per company, managed by the subscriber.
// Mounted before /:id routes so "categories" isn't read as an expense id.
// ---------------------------------------------------------------------

// GET /api/expenses/categories?include_archived=true
router.get('/categories', async (req, res, next) => {
  try {
    let query = supabase
      .from('l_expense_categories')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (req.query.include_archived !== 'true') query = query.eq('is_archived', false);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const { data, error } = await supabase
      .from('l_expense_categories')
      .insert({
        company_id: req.user.company_id,
        name,
        sort_order: Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 500,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: `You already have a category called "${name}"` });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/categories/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Category name is required' });
      updates.name = name;
    }
    if (req.body.is_archived !== undefined) updates.is_archived = Boolean(req.body.is_archived);
    if (req.body.sort_order !== undefined) updates.sort_order = Number(req.body.sort_order) || 0;

    const { data, error } = await supabase
      .from('l_expense_categories')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'You already have a category with that name' });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Deleting a category that still labels historical expenses would either
// orphan them or silently relabel them, so it's refused. Archiving hides
// it from the dropdown while leaving past records readable.
router.delete('/categories/:id', async (req, res, next) => {
  try {
    const { count, error: countErr } = await supabase
      .from('l_expenses')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (countErr) throw countErr;

    if ((count || 0) > 0) {
      return res.status(409).json({
        error:
          `${count} expense${count === 1 ? '' : 's'} still use this category. ` +
          'Archive it instead — it will disappear from the list without changing past records.',
      });
    }

    const { error } = await supabase
      .from('l_expense_categories')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------
// EXPENSES
// ---------------------------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    const { unit_id, category_id } = req.query;
    let query = supabase
      .from('l_expenses')
      .select('*, l_expense_categories(id, name)')
      .eq('company_id', req.user.company_id)
      .order('expense_date', { ascending: false });
    if (unit_id) query = query.eq('unit_id', unit_id);
    if (category_id) query = query.eq('category_id', category_id);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten the joined name so callers don't need to know the shape.
    res.json(
      (data || []).map(({ l_expense_categories, ...e }) => ({
        ...e,
        category_name: l_expense_categories?.name || null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { unit_id, category_id, amount, expense_date, description } = req.body;
    if (!unit_id || !category_id || !amount || !expense_date) {
      return res.status(400).json({ error: 'unit_id, category_id, amount and expense_date are required' });
    }
    if (!(await unitInCompany(unit_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Apartment not found' });
    }
    if (!(await categoryInCompany(category_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Expense category not found' });
    }

    const { data, error } = await supabase
      .from('l_expenses')
      .insert({
        company_id: req.user.company_id,
        unit_id,
        category_id,
        amount: toNumber(amount),
        expense_date,
        description: blank(description),
      })
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
      allowed: COLUMNS,
      numbers: ['amount'],
      dates: ['expense_date'],
      texts: ['description'],
    });
    delete updates.company_id; // never reassignable from the request body
    delete updates.id;

    if (updates.unit_id && !(await unitInCompany(updates.unit_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Apartment not found' });
    }
    if (updates.category_id && !(await categoryInCompany(updates.category_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Expense category not found' });
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
