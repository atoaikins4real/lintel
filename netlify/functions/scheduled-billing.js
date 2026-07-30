// Thin re-export — real logic in backend/src/scheduledBilling.js. Schedule
// (cron expression) is declared in netlify.toml under
// [functions."scheduled-billing"], not here.
module.exports = require('../../backend/src/scheduledBilling');
