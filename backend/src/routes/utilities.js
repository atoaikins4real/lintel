// UTILITIES
//
// Two levels, because subscribers hold very different stock:
//
//   l_utility_types  — the company's own list (Electricity, Water,
//                      Service charge, Generator / diesel, ...)
//   l_unit_utilities — which of those apply to a given APARTMENT, at what
//                      amount, and whether the tenant is charged for it
//
// The per-unit level is the important one. A bought flat in a high-rise
// carries a service charge and generator diesel; a self-built house
// carries neither but pays waste and recycling. Putting the amounts on
// the property (or worse, on the company) would force one building's
// arrangement onto every apartment in it.
//
// Amounts are a fixed figure per period rather than metered consumption.
// Meter readings would slot in as extra columns on l_unit_utilities
// without changing any of this shape.
const express = require('express');
const { supabase } = require('../config/supabase');
const { gateMutations } = require('../middleware/auth');
const { blank, toNumber } = require('../utils/sanitize');

const router = express.Router();
router.use(gateMutations);

const BILLING_PERIODS = ['monthly', 'quarterly', 'yearly'];

/** Confirms a row belongs to the caller's company. */
async function belongsToCompany(table, id, companyId) {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------
// TYPES — the company's list. Mounted before /units/:unitId so "types"
// is never read as a unit id.
// ---------------------------------------------------------------------

router.get('/types', async (req, res, next) => {
  try {
    let query = supabase
      .from('l_utility_types')
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

router.post('/types', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Utility name is required' });

    const { data, error } = await supabase
      .from('l_utility_types')
      .insert({
        company_id: req.user.company_id,
        name,
        sort_order: Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 500,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `You already have a utility called "${name}"` });
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/types/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ error: 'Utility name is required' });
      updates.name = name;
    }
    if (req.body.is_archived !== undefined) updates.is_archived = Boolean(req.body.is_archived);
    if (req.body.sort_order !== undefined) updates.sort_order = Number(req.body.sort_order) || 0;

    const { data, error } = await supabase
      .from('l_utility_types')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'You already have a utility with that name' });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Utility not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Refused while apartments still use it — deleting would strip the
// utility from every unit set up with it. Archiving hides it from the
// pickers and leaves existing arrangements alone.
router.delete('/types/:id', async (req, res, next) => {
  try {
    const { count, error: countErr } = await supabase
      .from('l_unit_utilities')
      .select('*', { count: 'exact', head: true })
      .eq('utility_type_id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (countErr) throw countErr;

    if ((count || 0) > 0) {
      return res.status(409).json({
        error:
          `${count} apartment${count === 1 ? '' : 's'} still use this utility. ` +
          'Archive it instead — it disappears from the list without changing them.',
      });
    }

    const { error } = await supabase
      .from('l_utility_types')
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
// PER-UNIT SETUP
// ---------------------------------------------------------------------

// GET /api/utilities/units/:unitId
router.get('/units/:unitId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_unit_utilities')
      .select('*, l_utility_types(id, name, is_archived)')
      .eq('unit_id', req.params.unitId)
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    res.json(
      (data || []).map(({ l_utility_types, ...u }) => ({
        ...u,
        utility_name: l_utility_types?.name || null,
        utility_archived: l_utility_types?.is_archived || false,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/units/:unitId', async (req, res, next) => {
  try {
    const { unitId } = req.params;
    const { utility_type_id, amount, billing_period, bill_to_tenant, notes } = req.body;

    if (!utility_type_id) return res.status(400).json({ error: 'Choose a utility' });
    if (billing_period && !BILLING_PERIODS.includes(billing_period)) {
      return res.status(400).json({ error: `Billing period must be one of: ${BILLING_PERIODS.join(', ')}` });
    }
    // The composite foreign keys already make a cross-company row
    // impossible; these checks turn a constraint violation into a clear
    // message.
    if (!(await belongsToCompany('l_units', unitId, req.user.company_id))) {
      return res.status(404).json({ error: 'Apartment not found' });
    }
    if (!(await belongsToCompany('l_utility_types', utility_type_id, req.user.company_id))) {
      return res.status(404).json({ error: 'Utility not found' });
    }

    const { data, error } = await supabase
      .from('l_unit_utilities')
      .insert({
        company_id: req.user.company_id,
        unit_id: unitId,
        utility_type_id,
        amount: toNumber(amount) || 0,
        billing_period: billing_period || 'monthly',
        bill_to_tenant: bill_to_tenant === undefined ? true : Boolean(bill_to_tenant),
        notes: blank(notes),
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'That utility is already set up for this apartment' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/units/:unitId/:id', async (req, res, next) => {
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (req.body.amount !== undefined) updates.amount = toNumber(req.body.amount) || 0;
    if (req.body.billing_period !== undefined) {
      if (!BILLING_PERIODS.includes(req.body.billing_period)) {
        return res.status(400).json({ error: `Billing period must be one of: ${BILLING_PERIODS.join(', ')}` });
      }
      updates.billing_period = req.body.billing_period;
    }
    if (req.body.bill_to_tenant !== undefined) updates.bill_to_tenant = Boolean(req.body.bill_to_tenant);
    if (req.body.is_active !== undefined) updates.is_active = Boolean(req.body.is_active);
    if (req.body.notes !== undefined) updates.notes = blank(req.body.notes);

    const { data, error } = await supabase
      .from('l_unit_utilities')
      .update(updates)
      .eq('id', req.params.id)
      .eq('unit_id', req.params.unitId)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Utility setup not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/units/:unitId/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_unit_utilities')
      .delete()
      .eq('id', req.params.id)
      .eq('unit_id', req.params.unitId)
      .eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
