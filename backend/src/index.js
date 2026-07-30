// Local development entrypoint only. `npm run dev` / `npm start` use this
// to run a normal, always-on server. The deployed (Netlify Functions)
// version of the API uses src/lambda.js instead, wrapping the exact same
// app from src/app.js — so local dev and production run identical route
// and middleware code.
const app = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Lintel API listening on port ${PORT}`);
});

// Local convenience only — in production, billing automation runs as a
// Netlify Scheduled Function (see netlify/functions/scheduled-billing.js),
// not this node-cron job.
if (process.env.ENABLE_CRON === 'true') {
  require('./cron');
}

module.exports = app;
