// The Express app itself — no app.listen() here. This file is shared by
// two entrypoints: src/index.js (local dev, runs a normal long-lived
// server) and src/lambda.js (wraps this same app for Netlify Functions via
// serverless-http). Keeping route/middleware wiring in one place means
// local dev and the deployed serverless function never drift apart.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');

const authRouter = require('./routes/auth');
const publicRouter = require('./routes/public');
const tenantPortalRouter = require('./routes/tenantPortal');
const tenantsRouter = require('./routes/tenants');
const unitsRouter = require('./routes/units');
const leasesRouter = require('./routes/leases');
const paymentsRouter = require('./routes/payments');
const expensesRouter = require('./routes/expenses');
const renovationsRouter = require('./routes/renovations');
const faultsRouter = require('./routes/faults');
const performanceRouter = require('./routes/performance');
const billingRouter = require('./routes/billing');
const reportsRouter = require('./routes/reports');
const bookingInquiriesRouter = require('./routes/bookingInquiries');
const uploadsRouter = require('./routes/uploads');
const settingsRouter = require('./routes/settings');
const companyRouter = require('./routes/company');
const propertiesRouter = require('./routes/properties');
const tenantOnboardingRouter = require('./routes/tenantOnboarding');
const accessRouter = require('./routes/access');
const adminRouter = require('./routes/admin');
const { enforceSubscription } = require('./middleware/subscription');
const { enforcePlanLimit } = require('./middleware/planLimits');

const app = express();

// Origins allowed to call this API from a browser. Set FRONTEND_URL in
// Netlify (comma-separated if more than one) — defaults cover local dev and
// the current Netlify domain so nothing breaks if it's left unset.
const allowedOrigins = (
  process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:4173,https://lintelapp.netlify.app'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = same-origin, curl, or a Netlify Function calling
      // itself — allow those. Otherwise it must be in the allowlist.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
  })
);
// Default limit is 100kb, which is far too small for the base64 image
// uploads on /api/uploads/photo (see routes/uploads.js). 10mb leaves room
// for base64's ~33% inflation over the 5mb image ceiling.
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ name: 'Lintel API', status: 'ok' });
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Auth routes and the public showcase/inquiry routes are the only ones
// reachable with no session — everything else under /api requires one.
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
// Tenant portal — no session; a hashed, expiring link is the whole
// authorisation, and it only ever reveals one tenant's own statement.
app.use('/api/tenant-portal', tenantPortalRouter);
app.use('/api', requireAuth);

// Subscription enforcement sits between auth and the data routes.
// Reads are never blocked; writes are refused once a subscription has
// lapsed past its grace period. Deliberately mounted BEFORE the data
// routers but AFTER /api/auth, so signing in and reading your own records
// keeps working no matter what state the subscription is in.
//
// Not applied to /api/admin (mounted below with its own gate) or
// /api/settings, so a lapsed subscriber can still see their own plan and
// payout details.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/settings') || req.path.startsWith('/admin')) return next();
  return enforceSubscription(req, res, next);
});

app.use('/api/properties', enforcePlanLimit('properties'), propertiesRouter);
// Nested under tenants — mounted before the tenants router so its
// /:id/contacts etc. take precedence over /:id.
app.use('/api/tenants/:id', tenantOnboardingRouter);
app.use('/api/tenants', enforcePlanLimit('tenants'), tenantsRouter);
app.use('/api/access', accessRouter);
app.use('/api/units', enforcePlanLimit('units'), unitsRouter);
app.use('/api/leases', leasesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/renovations', renovationsRouter);
app.use('/api/faults', faultsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/billing', billingRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/booking-inquiries', bookingInquiriesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/company', companyRouter);
// Platform-owner only. The single place that reads across companies —
// gated by requirePlatformAdmin, which re-checks the flag in the database
// on every request rather than trusting the 7-day token.
app.use('/api/admin', adminRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
