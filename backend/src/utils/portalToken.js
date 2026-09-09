// TENANT PORTAL TOKENS
//
// A tenant reaches their statement through a hashed, expiring link — no
// account, no password (see routes/tenantPortal.js for why). Minting one is
// needed in two places now: when a tenant asks for a link, and when the
// nightly job emails a rent reminder that should drop them straight onto
// their statement (where they can pay). This is that one shared step.
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const TOKEN_TTL_DAYS = 30;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/**
 * Create a fresh portal token for one tenant of one company and return the
 * RAW token (only its hash is stored). Throws on a DB error so the caller can
 * decide whether that's fatal — a reminder, for instance, is best-effort.
 */
async function mintPortalToken(companyId, tenantId, ttlDays = TOKEN_TTL_DAYS) {
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlDays * 86400000);
  const { error } = await supabase.from('l_tenant_portal_tokens').insert({
    company_id: companyId,
    tenant_id: tenantId,
    token_hash: hashToken(raw),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return raw;
}

module.exports = { mintPortalToken, hashToken, TOKEN_TTL_DAYS };
