// Thin re-export — all real logic lives in backend/src/lambda.js, kept
// there so its own `require('serverless-http')` resolves correctly via
// backend/node_modules. Netlify's function bundler traces this relative
// require and everything it pulls in (the whole Express app, all routes,
// all backend npm dependencies) at build time.
module.exports = require('../../backend/src/lambda');
