-- Estate-agent deal pipeline. Run once in the Supabase SQL editor.
--
-- Buyer enquiries (l_booking_inquiries) gain a pipeline `stage` and, for deals
-- that close, a `commission_amount`. Everything else about an enquiry is
-- unchanged; the old approve/decline `status` stays for the other roles.

ALTER TABLE public.l_booking_inquiries
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS commission_amount numeric;

-- Seed the stage from the existing status so current enquiries land sensibly.
UPDATE public.l_booking_inquiries
SET stage = CASE
  WHEN status = 'approved' THEN 'won'
  WHEN status = 'declined' THEN 'lost'
  ELSE 'new'
END
WHERE stage IS NULL;

NOTIFY pgrst, 'reload schema';
