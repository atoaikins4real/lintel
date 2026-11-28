-- OTA / iCal calendar sync for listings. Run once in the Supabase SQL editor.
--
-- l_calendar_feeds  : external .ics URLs to import for a listing (one per OTA —
--                     Airbnb, Booking.com, etc.).
-- l_external_bookings: busy date ranges pulled from those feeds. They block the
--                     listing in Lintel so it can't be double-booked, but are
--                     never shown as Lintel reservations.
-- l_units.ical_token : an unguessable token for the listing's public export
--                     feed URL, which the OTAs subscribe to in return.

CREATE TABLE IF NOT EXISTS public.l_calendar_feeds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  unit_id          uuid NOT NULL REFERENCES public.l_units(id) ON DELETE CASCADE,
  name             text,
  url              text NOT NULL,
  last_synced_at   timestamptz,
  last_status      text,
  last_event_count integer,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_calendar_feeds_company_idx ON public.l_calendar_feeds (company_id);
CREATE INDEX IF NOT EXISTS l_calendar_feeds_unit_idx ON public.l_calendar_feeds (unit_id);

CREATE TABLE IF NOT EXISTS public.l_external_bookings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL REFERENCES public.l_units(id) ON DELETE CASCADE,
  feed_id     uuid REFERENCES public.l_calendar_feeds(id) ON DELETE CASCADE,
  uid         text,
  summary     text,
  check_in    date NOT NULL,
  check_out   date NOT NULL,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_external_bookings_company_idx ON public.l_external_bookings (company_id);
CREATE INDEX IF NOT EXISTS l_external_bookings_unit_idx ON public.l_external_bookings (unit_id);

ALTER TABLE public.l_units
  ADD COLUMN IF NOT EXISTS ical_token uuid DEFAULT gen_random_uuid();

-- Backfill any rows that somehow have no token (older Postgres, odd states).
UPDATE public.l_units SET ical_token = gen_random_uuid() WHERE ical_token IS NULL;

NOTIFY pgrst, 'reload schema';
