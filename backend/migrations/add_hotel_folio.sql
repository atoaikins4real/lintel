-- Hotel / short-let guest folio. Run once in the Supabase SQL editor.
--
-- A payment can now hang off a reservation (incidental charges on a stay),
-- not only a lease. l_payments already carries charge_type, so the new
-- 'incidental' type needs no schema change — only the link column.

ALTER TABLE public.l_payments
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.l_reservations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS l_payments_reservation_idx ON public.l_payments (reservation_id);

NOTIFY pgrst, 'reload schema';
