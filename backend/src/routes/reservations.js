const express = require('express');
const { supabase } = require('../config/supabase');

const { gateMutations } = require('../middleware/auth');
const { blank, toNumber, clean } = require('../utils/sanitize');
const router = express.Router();
router.use(gateMutations);

// A reservation is a guest's stay in a room (rooms are l_units). Real columns
// on the table — anything else in the body is dropped. See utils/sanitize.js.
const COLUMNS = [
  'unit_id', 'guest_tenant_id', 'guest_name', 'guest_contact',
  'check_in', 'check_out', 'nightly_rate', 'status', 'source', 'notes',
  // Guest register / tourist details (optional) — kept per stay so the data
  // can be exported and, if desired, shared with a tourism board.
  'purpose_of_visit', 'nationality', 'id_type', 'id_number',
  'arriving_from', 'next_destination', 'guests_count',
];
// Statuses that actually hold a room (block the dates). A cancelled/no-show/
// checked-out reservation frees the room for someone else.
const ACTIVE = ['confirmed', 'checked_in'];
const ALL_STATUSES = [...ACTIVE, 'checked_out', 'cancelled', 'no_show'];

// Two date ranges [a_in, a_out) and [b_in, b_out) overlap iff
// a_in < b_out AND a_out > b_in. We only ever block against ACTIVE stays.
async function hasConflict(companyId, unitId, checkIn, checkOut, excludeId) {
  let q = supabase
    .from('l_reservations')
    .select('id')
    .eq('company_id', companyId)
    .eq('unit_id', unitId)
    .in('status', ACTIVE)
    .lt('check_in', checkOut)
    .gt('check_out', checkIn);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).length > 0;
}

router.get('/', async (req, res, next) => {
  try {
    const { unit_id, status, from, to } = req.query;
    let q = supabase
      .from('l_reservations')
      .select('*, l_units(unit_code, property_name, base_rate_short), l_tenants(first_name, last_name)')
      .eq('company_id', req.user.company_id)
      .order('check_in', { ascending: true });
    if (unit_id) q = q.eq('unit_id', unit_id);
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('check_out', from); // ends on/after `from`
    if (to) q = q.lte('check_in', to);      // starts on/before `to`

    const { data, error } = await q;
    if (error) throw error;

    res.json(
      (data || []).map(({ l_units, l_tenants, ...r }) => ({
        ...r,
        unit_code: l_units?.unit_code || null,
        property_name: l_units?.property_name || null,
        guest_display:
          r.guest_name ||
          (l_tenants ? `${l_tenants.first_name || ''} ${l_tenants.last_name || ''}`.trim() : null) ||
          'Guest',
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/reservations/availability?unit_id=&check_in=&check_out=&exclude=
router.get('/availability', async (req, res, next) => {
  try {
    const { unit_id, check_in, check_out, exclude } = req.query;
    if (!unit_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'unit_id, check_in and check_out are required' });
    }
    if (check_out <= check_in) return res.json({ available: false, reason: 'Check-out must be after check-in' });
    const conflict = await hasConflict(req.user.company_id, unit_id, check_in, check_out, exclude || null);
    res.json({ available: !conflict });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { unit_id, check_in, check_out } = req.body;
    if (!unit_id || !check_in || !check_out) {
      return res.status(400).json({ error: 'Room, check-in and check-out are required' });
    }
    if (check_out <= check_in) return res.status(400).json({ error: 'Check-out must be after check-in' });

    // The room must belong to this company (also gives us the default rate).
    const { data: unit } = await supabase
      .from('l_units')
      .select('id, base_rate_short')
      .eq('id', unit_id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!unit) return res.status(404).json({ error: 'Room not found' });

    const status = ALL_STATUSES.includes(req.body.status) ? req.body.status : 'confirmed';
    if (ACTIVE.includes(status) && (await hasConflict(req.user.company_id, unit_id, check_in, check_out))) {
      return res.status(409).json({ error: 'That room is already booked for those dates.' });
    }

    const { data, error } = await supabase
      .from('l_reservations')
      .insert({
        company_id: req.user.company_id,
        unit_id,
        guest_tenant_id: blank(req.body.guest_tenant_id),
        guest_name: blank(req.body.guest_name),
        guest_contact: blank(req.body.guest_contact),
        check_in,
        check_out,
        nightly_rate: toNumber(req.body.nightly_rate) ?? unit.base_rate_short ?? null,
        status,
        source: blank(req.body.source),
        notes: blank(req.body.notes),
        purpose_of_visit: blank(req.body.purpose_of_visit),
        nationality: blank(req.body.nationality),
        id_type: blank(req.body.id_type),
        id_number: blank(req.body.id_number),
        arriving_from: blank(req.body.arriving_from),
        next_destination: blank(req.body.next_destination),
        guests_count: toNumber(req.body.guests_count),
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
    const updates = clean(req.body, {
      allowed: COLUMNS,
      numbers: ['nightly_rate', 'guests_count'],
      dates: ['check_in', 'check_out'],
      texts: ['guest_tenant_id', 'guest_name', 'guest_contact', 'source', 'notes', 'status',
        'purpose_of_visit', 'nationality', 'id_type', 'id_number', 'arriving_from', 'next_destination'],
    });
    delete updates.company_id;

    const { data: current } = await supabase
      .from('l_reservations')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .maybeSingle();
    if (!current) return res.status(404).json({ error: 'Reservation not found' });

    const unitId = updates.unit_id || current.unit_id;
    const ci = updates.check_in || current.check_in;
    const co = updates.check_out || current.check_out;
    const st = updates.status || current.status;
    if (co <= ci) return res.status(400).json({ error: 'Check-out must be after check-in' });
    if (ACTIVE.includes(st) && (await hasConflict(req.user.company_id, unitId, ci, co, req.params.id))) {
      return res.status(409).json({ error: 'That room is already booked for those dates.' });
    }

    const { data, error } = await supabase
      .from('l_reservations')
      .update(updates)
      .eq('id', req.params.id)
      .eq('company_id', req.user.company_id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Reservation not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('l_reservations')
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
