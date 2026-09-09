-- Migration: automated tenant rent reminders
-- ------------------------------------------------------------
-- Idempotent — safe to re-run. Also appended to db/schema.sql.
--
-- The nightly job already raises charges and flags late ones, but only ever
-- emailed the OPERATOR. This lets it also nudge the TENANT: a friendly
-- "rent due soon" note, and a weekly "overdue" note, each deep-linked to
-- their own statement (where they can now pay online).
--
--   l_settings.tenant_reminders_enabled  — a subscriber's on/off switch
--                                          (default on; it's a courtesy).
--   l_payments.due_reminder_at           — when the "due soon" note went out,
--                                          so it's sent once, not every night.
--   l_payments.overdue_reminder_at       — when the last "overdue" note went
--                                          out, so it repeats weekly, not daily.
-- ------------------------------------------------------------

ALTER TABLE l_settings
  ADD COLUMN IF NOT EXISTS tenant_reminders_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE l_payments
  ADD COLUMN IF NOT EXISTS due_reminder_at timestamptz;
ALTER TABLE l_payments
  ADD COLUMN IF NOT EXISTS overdue_reminder_at timestamptz;
