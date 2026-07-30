// Handler for the Netlify Scheduled Function that replaces the local
// node-cron job in production: generates this period's charges for active
// long-stay leases, then flags any pending payment past its due date as
// late. Schedule is declared in netlify.toml, not here (see
// [functions."scheduled-billing"] schedule = "...").
const { generateCharges, flagLatePayments } = require('./utils/billing');

exports.handler = async function scheduledBillingHandler() {
  try {
    const gen = await generateCharges();
    const late = await flagLatePayments();
    console.log(
      `[scheduled-billing] generated ${gen.generated_count} charge(s), flagged ${late.flagged_count} as late`
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, generated: gen.generated_count, flagged: late.flagged_count }),
    };
  } catch (err) {
    console.error('[scheduled-billing] failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
