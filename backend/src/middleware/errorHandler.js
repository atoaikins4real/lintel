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

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || err.code || 'Internal server error',
    details: err.details || undefined,
  });
}

module.exports = { notFound, errorHandler };
