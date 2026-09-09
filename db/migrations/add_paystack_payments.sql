-- Migration: online rent payments via Paystack
-- ------------------------------------------------------------
-- Run once against an existing Lintel database. Idempotent — safe to
-- re-run. (The same statements are also appended to db/schema.sql so a
-- fresh install gets them automatically.)
--
-- Model: ONE Paystack integration owned by the platform (keys live in the
-- server environment, never in this table). Each SUBSCRIBER links their own
-- mobile-money or bank account — the existing l_settings.payout_* fields —
-- which the server registers as a Paystack *subaccount*. A tenant pays on
-- their phone and Paystack settles the money straight to that subscriber's
-- account. Lintel never holds the funds and never stores a card or a PIN.
--
-- What this adds:
--   l_settings.paystack_subaccount_code  — the subscriber's settlement
--                                          destination at Paystack.
--   l_settings.online_payments_enabled   — subscriber's on/off switch.
--   l_payments.gateway / gateway_reference — how a charge was settled and
--                                          the Paystack reference that did
--                                          it (unique per company, so a
--                                          webhook can reconcile exactly
--                                          once — no double-marking).
--   l_payment_transactions               — one row per online attempt: the
--                                          audit trail and the idempotency
--                                          anchor for the webhook.
-- ------------------------------------------------------------

-- ---- l_settings: settlement destination + switch --------------------
ALTER TABLE l_settings
  ADD COLUMN IF NOT EXISTS paystack_subaccount_code text;

ALTER TABLE l_settings
  ADD COLUMN IF NOT EXISTS online_payments_enabled boolean NOT NULL DEFAULT false;

-- ---- l_payments: how a charge was settled ---------------------------
ALTER TABLE l_payments
  ADD COLUMN IF NOT EXISTS gateway text;

ALTER TABLE l_payments
  ADD COLUMN IF NOT EXISTS gateway_reference text;

-- One Paystack reference settles at most one charge, and only once. The
-- unique index is what makes the webhook idempotent even if Paystack
-- delivers the same event twice (it can, and does).
CREATE UNIQUE INDEX IF NOT EXISTS idx_l_payments_gateway_reference
  ON l_payments (company_id, gateway_reference)
  WHERE gateway_reference IS NOT NULL;

-- Composite unique key so a transaction row can carry a company-scoped FK
-- to the charge it settles — the same (id, company_id) shape the six core
-- tables already use. `id` is already the primary key, so this is trivially
-- satisfied by every existing row; it exists only to be referenced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'l_payments_id_company_key'
  ) THEN
    ALTER TABLE l_payments
      ADD CONSTRAINT l_payments_id_company_key UNIQUE (id, company_id);
  END IF;
END $$;

-- ---- l_payment_transactions: the online-attempt ledger --------------
-- Separate from l_payments on purpose. A payment row is a CHARGE (raised by
-- billing, may be paid by any method). A transaction row is one ATTEMPT to
-- settle a charge online — initialized, then success/failed/abandoned. The
-- webhook and the redirect-verify both key off `reference` here, so a
-- charge is only ever marked paid once no matter which arrives first.
CREATE TABLE IF NOT EXISTS l_payment_transactions (
  company_id uuid NOT NULL REFERENCES l_companies (id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The charge this attempt settles. Composite FK to (company_id, id) keeps
  -- a transaction from ever pointing at another company's payment — the same
  -- isolation guarantee every other table carries. SET NULL on delete so an
  -- attempt's audit trail survives a charge being removed.
  payment_id uuid,
  tenant_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'initialized',
  channel text,                               -- mobile_money, card, bank, ...
  gateway text NOT NULL DEFAULT 'paystack',
  authorization_url text,
  gateway_response jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT l_payment_transactions_status_check
    CHECK (status IN ('initialized','success','failed','abandoned')),
  CONSTRAINT l_payment_transactions_payment_fk
    FOREIGN KEY (payment_id, company_id)
    REFERENCES l_payments (id, company_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_l_payment_transactions_company
  ON l_payment_transactions (company_id);
CREATE INDEX IF NOT EXISTS idx_l_payment_transactions_payment
  ON l_payment_transactions (payment_id);
CREATE INDEX IF NOT EXISTS idx_l_payment_transactions_tenant
  ON l_payment_transactions (tenant_id);

ALTER TABLE l_payment_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON l_payment_transactions TO service_role;
