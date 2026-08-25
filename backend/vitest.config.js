const { defineConfig } = require('vitest/config');

// Node/Express backend — no DOM, real timers. Tests run against the actual
// Express app (via supertest) with the Supabase client swapped for an
// in-memory fake, plus pure-function unit tests that need no fake at all.
module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    // A route handler that throws lands in errorHandler, which console.errors
    // a deliberately noisy dump. That's correct in production but drowns the
    // test reporter — silence it here; assertions still check the response.
    silent: false,
    clearMocks: true,
  },
});
