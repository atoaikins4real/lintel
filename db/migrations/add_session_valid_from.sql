-- Migration: immediate session revocation
-- ------------------------------------------------------------
-- role and company_id are read from a 7-day JWT and were never re-checked,
-- so demoting a user, moving them between companies, or offboarding a staff
-- member could take up to a week to take effect. This column is the cutoff:
-- any token issued *before* a user's session_valid_from is rejected on its
-- next request, forcing a fresh sign-in (which mints a token with the new
-- role/company). Bumped to now() on role change, password reset, and
-- platform-admin grant/revoke.
--
-- Defaults to now() for existing rows, so no currently-valid session is
-- invalidated by running this. Idempotent and l_ only.
-- ------------------------------------------------------------

ALTER TABLE l_users
  ADD COLUMN IF NOT EXISTS session_valid_from timestamptz NOT NULL DEFAULT now();
