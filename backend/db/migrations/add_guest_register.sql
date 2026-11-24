-- Guest register / tourist details for Lintel reservations.
-- Run this once in the Supabase SQL editor (or via your migration tool).
-- Safe to re-run AND safe to run on a database that never had the hospitality
-- migration: every statement is guarded with IF NOT EXISTS, and the hospitality
-- objects are (re)ensured first so this single file brings the DB fully up to
-- date on its own.

-- 0) Hospitality essentials (idempotent — no-ops if add_hospitality already ran)
ALTER TABLE public.l_companies
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'rental';

CREATE TABLE IF NOT EXISTS public.l_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  unit_id         uuid NOT NULL REFERENCES public.l_units(id)     ON DELETE CASCADE,
  guest_tenant_id uuid REFERENCES public.l_tenants(id)            ON DELETE SET NULL,
  guest_name      text,
  guest_contact   text,
  check_in        date NOT NULL,
  check_out       date NOT NULL,
  nightly_rate    numeric,
  status          text NOT NULL DEFAULT 'confirmed',
  source          text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_reservations_company_idx ON public.l_reservations (company_id);
CREATE INDEX IF NOT EXISTS l_reservations_unit_idx    ON public.l_reservations (unit_id);
CREATE INDEX IF NOT EXISTS l_reservations_dates_idx   ON public.l_reservations (company_id, check_in, check_out);

-- 1) Guest register fields. These are the "standard questions a tourist is
--    asked" on arrival, kept per stay so the data can later be exported and,
--    if you choose, shared with a tourism board. All optional and additive.
ALTER TABLE public.l_reservations
  ADD COLUMN IF NOT EXISTS purpose_of_visit  text,   -- business | leisure | other
  ADD COLUMN IF NOT EXISTS nationality       text,
  ADD COLUMN IF NOT EXISTS id_type           text,   -- passport | ghana_card | drivers_license | other
  ADD COLUMN IF NOT EXISTS id_number         text,
  ADD COLUMN IF NOT EXISTS arriving_from      text,
  ADD COLUMN IF NOT EXISTS next_destination   text,
  ADD COLUMN IF NOT EXISTS guests_count       integer;
