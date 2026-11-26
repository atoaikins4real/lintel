-- Housekeeping room status (hotel side). Run once in the Supabase SQL editor.
ALTER TABLE public.l_units
  ADD COLUMN IF NOT EXISTS housekeeping_status text NOT NULL DEFAULT 'clean';

NOTIFY pgrst, 'reload schema';
