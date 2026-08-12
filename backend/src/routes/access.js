// Access credentials — keycards, fobs, PINs, mobile keys.
//
// IMPORTANT: this is the record-keeping layer only. Lintel does not talk
// to any lock hardware, so issuing a card here does not physically
// program or open anything. The shape is deliberately reader-agnostic
// (identifier + holder + scope + validity window) so a real controller
// can be connected later without remodelling the data.
const express = require('express');
const { supabase } = require('../config/supabase');
const { gateMutations, requireRole } = require('../middleware/auth');
const { blank } = require('../utils/sanitize');

const router = express.Router();
router.use(gateMutations);

const CREDENTIAL_TYPES = ['keycard', 'fob', 'pin', 'mobile_key', 'biometric'];
const STATUSES = ['active', 'lost', 'revoked', 'expired'];

const SELECT =
  '*, l_tenants(first_name, last_name, lintel_id), l_properties(name), l_units(unit_code)';

// Verifies any referenced tenant/property/unit belongs to this company,
// so a credential can't be pointed at another company's records.
async function assertRefs(req) {
  const checks = [
    ['tenant_id', 'l_tenants'],
    ['property_id', 'l_properties'],
    ['unit_id', 'l_units'],
  ];
  for (const [field, table] of checks) {
    const value = blank(req.body[field]);
    if (!value) continue;
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq('id', value)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!data) return `${field.replace('_id', '')} not found`;
  }
  return null;
}

// GET /api/access/credentials?status=&property_id=&tenant_id=
router.get('/credentials', async (req, res, next) => {
  try {
    const { status, property_id, tenant_id, unit_id } = req.query;
    let query = supabase
      .from('l_access_credentials')
      .select(SELECT)
      .eq('company_id', req.user.company_id)
      .order('issued_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (property_id) query = query.eq('property_id', property_id);
    if (tenant_id) query = query.eq('tenant_id', tenant_id);
    if (unit_id) query = query.eq('unit_id', unit_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/access/credentials — issue a card
router.post('/credentials', async (req, res, next) => {
  try {
    const { card_number, credential_type, tenant_id, holder_name } = req.body;

    if (!card_number || !String(card_number).trim()) {
      return res.status(400).json({ error: 'Card number is required' });
    }
    if (credential_type && !CREDENTIAL_TYPES.includes(credential_type)) {
      return res.status(400).json({ error: `Type must be one of: ${CREDENTIAL_TYPES.join(', ')}` });
    }
    if (!tenant_id && !String(holder_name || '').trim()) {
      return res.status(400).json({ error: 'Choose a tenant, or enter a holder name for staff/contractors' });
    }

    const refError = await assertRefs(req);
    if (refError) return res.status(404).json({ error: refError });

    const payload = {
      card_number: String(card_number).trim(),
      credential_type: credential_type || 'keycard',
      label: blank(req.body.label),
      tenant_id: blank(tenant_id),
      holder_name: blank(holder_name),
      property_id: blank(req.body.property_id),
      unit_id: blank(req.body.unit_id),
      valid_from: blank(req.body.valid_from),
      valid_until: blank(req.body.valid_until),
      notes: blank(req.body.notes),
      issued_by: req.user.id,
      replaces_id: blank(req.body.replaces_id),
    };

    const { data, error } = await supabase
      .from('l_access_credentials')
      .insert({ ...payload, company_id: req.user.company_id })
      .select(SELECT)
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A credential with that card number already exists' });
      }
      throw error;
    }

    // Issuing a replacement automatically retires the card it replaces,
    // so a lost card can't be left active by accident.
    if (payload.replaces_id) {
      await supabase
        .from('l_access_credentials')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_reason: 'Replaced' })
        .eq('id', payload.replaces_id)
        .eq('company_id', req.user.company_id);
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/access/credentials/:id — change status, validity or notes.
// Manager/finance only (gateMutations already covers this, but revoking
// access is worth being explicit about).
router.patch('/credentials/:id', requireRole('manager', 'finance'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
    }

    const updates = {};
    if (status) {
      updates.status = status;
      if (status === 'revoked' || status === 'lost') {
        updates.revoked_at = new Date().toISOString();
        updates.revoked_reason = blank(req.body.revoked_reason) || (status === 'lost' ? 'Reported lost' : 'Revoked');
      } else {
        updates.revoked_at = null;
        updates.revoked_reason = null;
      }
    }
    for (const f of ['valid_from', 'valid_until', 'label', 'notes']) {
      if (req.body[f] !== undefined) updates[f] = blank(req.body[f]);
    }

    const { data, error } = await supabase
      .from('l_access_credentials')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select(SELECT)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Credential not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/access/events — door activity. Empty until real reader
// hardware posts here; the endpoint exists so the history has somewhere
// to land from day one.
router.get('/events', async (req, res, next) => {
  try {
    const { credential_id, property_id, limit } = req.query;
    let query = supabase
      .from('l_access_events')
      .select('*, l_access_credentials(card_number, holder_name), l_properties(name), l_units(unit_code)')
      .eq('company_id', req.user.company_id)
      .order('occurred_at', { ascending: false })
      .limit(Math.min(500, Math.max(1, Number(limit) || 100)));

    if (credential_id) query = query.eq('credential_id', credential_id);
    if (property_id) query = query.eq('property_id', property_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
