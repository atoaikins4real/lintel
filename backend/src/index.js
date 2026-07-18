require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { notFound, errorHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');

const authRouter = require('./routes/auth');
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

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.json({ name: 'Lintel API', status: 'ok' });
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Auth routes are public (login/register/bootstrap-status); everything
// else under /api requires a valid session.
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

app.use('/api/tenants', tenantsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/leases', leasesRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/renovations', renovationsRouter);
app.use('/api/faults', faultsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/billing', billingRouter);
app.use('/api/reports', reportsRouter);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Lintel API listening on port ${PORT}`);
});

if (process.env.ENABLE_CRON === 'true') {
  require('./cron');
}

module.exports = app;
