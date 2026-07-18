const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
require('dotenv').config();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[lintel] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. ' +
      'Copy .env.example to .env and fill in your Supabase project credentials.'
  );
}

// Service-role client — used server-side only. Never expose this key to a
// frontend. The Express API is the trust boundary; the frontend only ever
// talks to this API, never directly to Supabase with this key.
//
// Lintel never uses Supabase Realtime, but supabase-js still initializes a
// RealtimeClient internally, which requires a native WebSocket global. On
// Node <22 that global doesn't exist, so we polyfill it via the `ws`
// package rather than requiring everyone to upgrade Node system-wide.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

module.exports = { supabase };
