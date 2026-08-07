const express = require('express');
const { requireRole } = require('../middleware/auth');
const { generateCharges, flagLatePayments, getBillingSummary } = require('../utils/billing');

const router = express.Router();

// GET /api/billing/summary — any authenticated role can view
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await getBillingSummary(req.user.company_id);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/generate — manager/finance only. Creates pending
// payments for active long-stay leases not yet billed this period.
router.post('/generate', requireRole('manager', 'finance'), async (req, res, next) => {
  try {
    const result = await generateCharges(req.user.company_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/billing/flag-late — manager/finance only.
router.post('/flag-late', requireRole('manager', 'finance'), async (req, res, next) => {
  try {
    const result = await flagLatePayments(req.user.company_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
