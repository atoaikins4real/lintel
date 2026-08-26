// Loads the real Express app with the Supabase client swapped for the
// in-memory fake — without depending on Vitest's module mocker.
//
// WHY NOT vi.mock: the backend is entirely CommonJS with `"type":
// "commonjs"`, so Vitest native-loads app.js through Node's require and
// never routes its internal `require('./config/supabase')` through the mock
// registry. (A direct ESM `import` of config IS mocked, but the app's own
// require isn't — proven during setup.)
//
// Instead we exploit the single seam directly: require config/supabase FIRST,
// replace its exported `.supabase` with the fake, and only THEN require the
// app. Every route/middleware does `const { supabase } = require('../config/
// supabase')` at load time, so as long as the swap happens before the app
// graph loads, they all destructure the fake. The lazy `require(...supabase)`
// calls inside functions read it at call time, so they get the fake too.
//
// seedDemoData is stubbed to a no-op: it fires dozens of inserts that aren't
// the subject of these tests, and letting it run against the fake would just
// add noise. No test here exercises seeding.

const fake = require('./fakeSupabase');

// 1. Load config and swap the client BEFORE the app graph is required.
const cfg = require('../../src/config/supabase');
cfg.supabase = fake.supabase;

// 2. Neutralise the demo seeder (see note above).
const seed = require('../../src/utils/seedDemoData');
seed.seedDemoData = async () => {};

// 3. requireAuth now reads the caller's l_users row on every authenticated
//    request (the session-revocation check). Give it a benign default — an
//    existing account with no revocation cutoff — so tests that don't care
//    about revocation pass unchanged. A test that registers its own l_users
//    handler (or wants to simulate a deleted user / a cutoff) overrides this.
fake.setDefault('l_users', () => ({ data: { session_valid_from: null } }));

// 4. Now it's safe to load the app — everything downstream sees the fake.
const app = require('../../src/app');

module.exports = { app, fake };
