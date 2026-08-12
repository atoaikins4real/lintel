// Tenant onboarding sub-resources: emergency contacts / next of kin,
// additional occupants, and vehicles. Mounted under /api/tenants/:id so
// they read naturally, and every query is filtered by company_id.
//
// mergeParams is required for req.params.id (the tenant) to be visible
// from this nested router.
const express = require('express');
const { supabase } = require('../config/supabase');
const { gateMutations } = require('../middleware/auth');
const { blank } = require('../utils/sanitize');

const router = express.Router({ mergeParams: true });
// Same rule as everywhere else: any signed-in role can read, only
// manager/finance can write.
router.use(gateMutations);

// Confirms the tenant exists AND belongs to the caller's company before
// any child record is read or written — otherwise someone could attach a
// contact to another company's tenant by guessing an id.
async function assertTenant(req, res) {
  const { data } = await supabase
    .from('l_tenants')
    .select('id')
    .eq('id', req.params.id)
    .eq('company_id', req.user.company_id)
    .maybeSingle();
  if (!data) {
    res.status(404).json({ error: 'Tenant not found' });
    return null;
  }
  return data;
}

const RESOURCES = {
  contacts: {
    table: 'l_tenant_contacts',
    required: ['name'],
    fields: ['name', 'relationship', 'phone', 'email', 'address'],
    booleans: ['is_next_of_kin'],
  },
  occupants: {
    table: 'l_tenant_occupants',
    required: ['full_name'],
    fields: ['full_name', 'relationship', 'date_of_birth', 'notes'],
    booleans: [],
  },
  vehicles: {
    table: 'l_tenant_vehicles',
    required: ['plate_number'],
    fields: ['plate_number', 'make', 'model', 'colour', 'parking_slot', 'notes'],
    booleans: [],
  },
};

for (const [segment, spec] of Object.entries(RESOURCES)) {
  router.get(`/${segment}`, async (req, res, next) => {
    try {
      if (!(await assertTenant(req, res))) return;
      const { data, error } = await supabase
        .from(spec.table)
        .select('*')
        .eq('tenant_id', req.params.id)
        .eq('company_id', req.user.company_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post(`/${segment}`, async (req, res, next) => {
    try {
      if (!(await assertTenant(req, res))) return;

      for (const field of spec.required) {
        if (!req.body[field] || !String(req.body[field]).trim()) {
          return res.status(400).json({ error: `${field.replace(/_/g, ' ')} is required` });
        }
      }

      const payload = { company_id: req.user.company_id, tenant_id: req.params.id };
      for (const f of spec.fields) payload[f] = blank(req.body[f]);
      for (const f of spec.booleans) payload[f] = Boolean(req.body[f]);

      const { data, error } = await supabase.from(spec.table).insert(payload).select().single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  });

  router.delete(`/${segment}/:childId`, async (req, res, next) => {
    try {
      if (!(await assertTenant(req, res))) return;
      const { error } = await supabase
        .from(spec.table)
        .delete()
        .eq('id', req.params.childId)
        .eq('tenant_id', req.params.id)
        .eq('company_id', req.user.company_id);
      if (error) throw error;
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
}

// POST /api/tenants/:id/complete-onboarding
router.post('/complete-onboarding', async (req, res, next) => {
  try {
    if (!(await assertTenant(req, res))) return;
    const { data, error } = await supabase
      .from('l_tenants')
      .update({ onboarding_status: 'complete', onboarded_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
