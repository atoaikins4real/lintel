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
  'tenant_id',
  'description',
  'fault_type',
  'severity',
  'caused_by',
  'status',
  'reported_date',
  'resolved_date',
  'cost',
  // Who reported it — a linked tenant (tenant_id above) or a free-text
  // person (a neighbour, security, staff, the manager themselves).
  'reporter_name',
  'reporter_contact',
];



router.get('/', async (req, res, next) => {
  try {
    const { unit_id, tenant_id, status } = req.query;
    let query = supabase.from('l_faults').select('*').eq('company_id', req.user.company_id).order('reported_date', { ascending: false });
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
    const { unit_id, tenant_id, description, fault_type, severity, caused_by, reported_date, cost,
      reporter_name, reporter_contact } = req.body;
    if (!unit_id || !description) {
      return res.status(400).json({ error: 'unit_id and description are required' });
    }

    const { data, error } = await supabase
      .from('l_faults')
      .insert({
        company_id: req.user.company_id,
        unit_id,
        tenant_id: blank(tenant_id),
        description,
        fault_type: blank(fault_type),
        severity: severity || 'low',
        caused_by: caused_by || 'unknown',
        reported_date: blank(reported_date) || new Date().toISOString().slice(0, 10),
        cost: toNumber(cost),
        reporter_name: blank(reporter_name),
        reporter_contact: blank(reporter_contact),
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
      allowed: COLUMNS,
      numbers: ['cost'],
      dates: ['reported_date', 'resolved_date'],
      texts: ['tenant_id', 'description', 'fault_type', 'reporter_name', 'reporter_contact'],
    });
    delete updates.company_id;
    const { data, error } = await supabase
      .from('l_faults')
      .update(updates)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'Fault not found' });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_faults')
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
