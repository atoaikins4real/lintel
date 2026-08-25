-- Migration: self-serve plan changes
-- ------------------------------------------------------------
-- Run once against an existing Lintel database. Idempotent — safe to
-- re-run. (The same statements are also appended to db/schema.sql so a
-- fresh install gets them automatically.)
--
-- Adds l_subscription_requests: a subscriber can ASK for a plan change or a
-- cancellation; the platform operator applies or declines it from /admin.
-- Subscription state itself stays operator-controlled in l_subscriptions.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS l_subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES l_companies (id) ON DELETE CASCADE,
  requested_plan_id uuid REFERENCES l_plans (id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'change',
  status text NOT NULL DEFAULT 'pending',
  note text,
  requested_by uuid REFERENCES l_users (id) ON DELETE SET NULL,
  decided_by uuid REFERENCES l_users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT l_subscription_requests_kind_check CHECK (kind IN ('change','cancel')),
  CONSTRAINT l_subscription_requests_status_check
    CHECK (status IN ('pending','applied','declined','withdrawn'))
);

CREATE UNIQUE INDEX IF NOT EXISTS l_subscription_requests_one_pending
  ON l_subscription_requests (company_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS l_subscription_requests_company
  ON l_subscription_requests (company_id);

ALTER TABLE l_subscription_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON l_subscription_requests TO service_role;
