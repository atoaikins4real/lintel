// Custom worker roles — a named set of permission keys, per company. Managers
// create them and assign them to members; a member then sees and can touch
// only what their role allows. Read is open to any signed-in user (so the
// staff screen can show role names); writes are manager-only.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');
const { ALL_PERMS } = require('../utils/permissions');

const router = express.Router();

const cleanPerms = (p) => (Array.isArray(p) ? p.filter((k) => ALL_PERMS.includes(k)) : []);

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('l_roles')
      .select('*')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Give the role a name' });
    const { data, error } = await supabase
      .from('l_roles')
      .insert({ company_id: req.user.company_id, name, permissions: cleanPerms(req.body.permissions) })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      const n = String(req.body.name).trim();
      if (!n) return res.status(400).json({ error: 'Give the role a name' });
      updates.name = n;
    }
    if (req.body.permissions !== undefined) updates.permissions = cleanPerms(req.body.permissions);

    const { data, error } = await supabase
      .from('l_roles')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Role not found' });

    // Permission changes should take effect promptly: sign out anyone on this
    // role so their next sign-in picks up the new access.
    await supabase
      .from('l_users')
      .update({ session_valid_from: new Date().toISOString() })
      .eq('custom_role_id', req.params.id)
      .eq('company_id', req.user.company_id);

    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    // Unassign the role from anyone using it (they fall back to default member
    // access), then remove it.
    await supabase
      .from('l_users')
      .update({ custom_role_id: null, session_valid_from: new Date().toISOString() })
      .eq('custom_role_id', req.params.id)
      .eq('company_id', req.user.company_id);
    const { error } = await supabase
      .from('l_roles')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
