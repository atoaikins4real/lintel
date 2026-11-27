-- Seasonal / per-date pricing and minimum-stay for short-let listings (and any
-- room). Run once in the Supabase SQL editor.
--
-- Each override covers a date range for one listing: a nightly rate that beats
-- the listing's base rate while it is in effect, and/or a minimum number of
-- nights a booking that starts in the range must run for. The agreed figure is
-- still written onto each reservation, so changing or deleting an override
-- never alters a booking already taken.

CREATE TABLE IF NOT EXISTS public.l_rate_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  unit_id      uuid NOT NULL REFERENCES public.l_units(id) ON DELETE CASCADE,
  label        text,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  nightly_rate numeric,
  min_stay     integer,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_rate_overrides_company_idx ON public.l_rate_overrides (company_id);
CREATE INDEX IF NOT EXISTS l_rate_overrides_unit_idx ON public.l_rate_overrides (unit_id);

NOTIFY pgrst, 'reload schema';
