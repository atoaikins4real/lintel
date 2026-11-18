-- Hotel / hospitality support for Lintel.
-- Run this once in the Supabase SQL editor (or via your migration tool).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.

-- 1) A company is either a long-let landlord ('rental', default) or a
--    hotel / resort / guest house ('hospitality'). Chosen at sign-up.
ALTER TABLE public.l_companies
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'rental';

-- 2) Reservations — a guest's stay in a room. Rooms are l_units, so the
--    whole units/photos/rates model is reused; this table only adds the
--    booking itself (dates, guest, status). No enum changes needed.
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
  -- status: confirmed | checked_in | checked_out | cancelled | no_show
  source          text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS l_reservations_company_idx ON public.l_reservations (company_id);
CREATE INDEX IF NOT EXISTS l_reservations_unit_idx    ON public.l_reservations (unit_id);
CREATE INDEX IF NOT EXISTS l_reservations_dates_idx   ON public.l_reservations (company_id, check_in, check_out);
