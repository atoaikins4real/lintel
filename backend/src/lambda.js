// Wraps the Express app (src/app.js) for Netlify Functions using
// serverless-http. This file deliberately lives inside backend/src so
// requiring 'serverless-http' resolves via backend/node_modules — the
// actual netlify/functions/*.js files just re-export from here rather
// than requiring npm packages directly from outside this folder.
const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app);
