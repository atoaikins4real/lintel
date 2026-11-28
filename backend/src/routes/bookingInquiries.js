// Staff-facing view of inquiries submitted from the public showcase pages
// (see routes/public.js for where they're created). Mounted alongside the
// other authenticated routers in app.js, so requireAuth already covers
// GET here — read access matches the rest of the app (any signed-in role,
// including viewer). Only manager/finance can change status.
const express = require('express');
const { supabase } = require('../config/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/booking-inquiries?status=pending
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('l_booking_inquiries')
      .select('*, l_units(unit_code, property_name)')
      .eq('company_id', req.user.company_id)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/booking-inquiries/:id — approve/decline. Deliberately does
// NOT touch leases — a manager creates the real lease themselves once
// they've actually confirmed the booking (dates, payment, etc.) off this
// simple inquiry record.
router.patch('/:id', requireRole('manager', 'finance'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = {};
    if (req.body.status !== undefined) {
      const allowed = ['pending', 'approved', 'declined'];
      if (!allowed.includes(req.body.status)) {
        return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      }
      updates.status = req.body.status;
    }
    if (req.body.stage !== undefined) {
      const stages = ['new', 'contacted', 'viewing', 'offer', 'won', 'lost'];
      if (!stages.includes(req.body.stage)) {
        return res.status(400).json({ error: `stage must be one of: ${stages.join(', ')}` });
      }
      updates.stage = req.body.stage;
      // Keep the legacy approve/decline status roughly in step for other views.
      if (req.body.stage === 'won' && updates.status === undefined) updates.status = 'approved';
      if (req.body.stage === 'lost' && updates.status === undefined) updates.status = 'declined';
    }
    if (req.body.commission_amount !== undefined) {
      const c = req.body.commission_amount;
      updates.commission_amount = (c === '' || c === null) ? null : Number(c);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const { data, error } = await supabase
      .from('l_booking_inquiries')
      .update(updates)
      .eq('id', id)
      .eq('company_id', req.user.company_id)
      .select('*, l_units(unit_code, property_name)')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Request not found' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
