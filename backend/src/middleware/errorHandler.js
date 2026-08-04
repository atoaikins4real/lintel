const util = require('util');

function notFound(req, res, next) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // console.error(err) alone can print `{ message: '' }` for some non-Error
  // objects (e.g. Supabase/undici error shapes) and hides the real cause.
  // Dump everything we can: own properties (incl. non-enumerable like
  // `stack`/`cause`), plus the raw util.inspect output.
  console.error('--- error caught by errorHandler ---');
  console.error('name:', err?.name);
  console.error('message:', err?.message);
  console.error('code:', err?.code);
  console.error('cause:', err?.cause);
  console.error('stack:', err?.stack);
  console.error('full object:', util.inspect(err, { depth: 6, showHidden: false }));
  console.error('-------------------------------------');

  // err.status means the code deliberately threw a client-facing error
  // (validation, 404, etc.) — safe to show its message. An error with no
  // status is an unexpected exception; in production, don't echo its
  // message/stack-derived text back to whoever's hitting the API — it's
  // already logged above for us to debug from.
  const status = err.status || 500;
  // Netlify sets CONTEXT ("production"/"deploy-preview"/"branch-deploy")
  // automatically on every build AND function invocation — no site config
  // needed. Deliberately NOT using NODE_ENV=production here: setting that
  // as a site env var breaks `npm install` during the build (it makes npm
  // skip devDependencies, which is where `vite` lives — silent "vite: not
  // found" build failures). NODE_ENV is kept as a fallback for non-Netlify
  // hosts where CONTEXT won't be set.
  const isProd = process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production';

  if (isProd && !err.status) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  res.status(status).json({
    error: err.message || err.code || 'Internal server error',
    details: err.details || undefined,
  });
}

module.exports = { notFound, errorHandler };
