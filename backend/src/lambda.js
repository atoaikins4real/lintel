// Wraps the Express app (src/app.js) for Netlify Functions using
// serverless-http. This file deliberately lives inside backend/src so
// requiring 'serverless-http' resolves via backend/node_modules — the
// actual netlify/functions/*.js files just re-export from here rather
// than requiring npm packages directly from outside this folder.
const serverless = require('serverless-http');
const app = require('./app');

const serverlessHandler = serverless(app);

// Netlify strips the "/.netlify/functions/<function-name>" prefix before
// invoking the function. A request that arrived as "/api/auth/login" (via
// the /api/* -> /.netlify/functions/api/:splat redirect in netlify.toml)
// reaches us here as event.path === "/auth/login" — NOT "/api/auth/login".
// Every route in app.js is mounted under "/api/..." (matching local dev,
// where no such stripping happens), so without this, every request 404s.
// Re-add the "/api" prefix Netlify stripped off.
module.exports.handler = async (event, context) => {
  if (event.path && !event.path.startsWith('/api')) {
    event.path = '/api' + event.path;
  }
  return serverlessHandler(event, context);
};
