-- Migration: security-deposit ledger
-- ------------------------------------------------------------
-- Idempotent — safe to re-run. Also appended to db/schema.sql.
--
-- A security deposit is money HELD, not earned — a liability you owe back to
-- the tenant, minus any justified deductions. Until now a deposit could only
-- be recorded as a payment with charge_type='deposit', which meant a held
-- deposit counted as revenue. That's wrong twice over: it overstates income,
-- and it loses track of what must eventually be returned.
--
-- This adds a real ledger:
--   l_deposits          — one record per deposit held against a lease.
--   l_deposit_entries   — every movement: the initial hold, each deduction
--                         (with a reason), and each refund. The held balance
--                         is hold − deductions − refunds.
-- The reports layer is separately changed to exclude charge_type='deposit'
-- from revenue, so a deposit no longer looks like income.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS l_deposits (
  company_id uuid NOT NULL REFERENCES l_companies (id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id uuid REFERENCES l_leases (id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES l_tenants (id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES l_units (id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,               -- amount originally received
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'held',          -- held | partially_returned | returned | forfeited
  received_on date NOT NULL DEFAULT current_date,
  settled_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT l_deposits_status_check
    CHECK (status IN ('held','partially_returned','returned','forfeited'))
);

-- Composite unique so the entries table can carry a company-scoped FK.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'l_deposits_id_company_key') THEN
    ALTER TABLE l_deposits ADD CONSTRAINT l_deposits_id_company_key UNIQUE (id, company_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_l_deposits_tenant ON l_deposits (tenant_id);
CREATE INDEX IF NOT EXISTS idx_l_deposits_lease ON l_deposits (lease_id);
CREATE INDEX IF NOT EXISTS idx_l_deposits_company ON l_deposits (company_id);

CREATE TABLE IF NOT EXISTS l_deposit_entries (
  company_id uuid NOT NULL REFERENCES l_companies (id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL,
  kind text NOT NULL,                            -- hold | deduct | refund
  amount numeric(12,2) NOT NULL,
  reason text,
  created_by uuid REFERENCES l_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT l_deposit_entries_kind_check CHECK (kind IN ('hold','deduct','refund')),
  CONSTRAINT l_deposit_entries_deposit_fk
    FOREIGN KEY (deposit_id, company_id)
    REFERENCES l_deposits (id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_l_deposit_entries_deposit ON l_deposit_entries (deposit_id);
CREATE INDEX IF NOT EXISTS idx_l_deposit_entries_company ON l_deposit_entries (company_id);

ALTER TABLE l_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE l_deposit_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON l_deposits, l_deposit_entries TO service_role;
