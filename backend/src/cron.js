// Optional daily billing automation. Only loaded when ENABLE_CRON=true.
// Runs once a day at 00:05 server time while the backend process stays up
// (no external scheduler needed for a small self-hosted deployment).
const cron = require('node-cron');
const { generateCharges, flagLatePayments } = require('./utils/billing');

cron.schedule('5 0 * * *', async () => {
  try {
    const gen = await generateCharges();
    const late = await flagLatePayments();
    console.log(`[billing cron] generated ${gen.generated_count} charge(s), flagged ${late.flagged_count} as late`);
  } catch (err) {
    console.error('[billing cron] failed:', err.message);
  }
});

console.log('[billing cron] scheduled — daily at 00:05');
