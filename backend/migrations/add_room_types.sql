-- Hotel room types & rate plans. Run once in the Supabase SQL editor.
--
-- A room type groups rooms that share a price and size (Standard, Deluxe,
-- Suite…). Each type has one or more rate plans — named nightly prices such as
-- "Standard", "Non-refundable" or "Bed & breakfast" — that a reservation can be
-- booked on. Rooms (l_units) point at their type; reservations point at the
-- rate plan they were booked on.

CREATE TABLE IF NOT EXISTS public.l_room_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  base_rate   numeric,
  capacity    integer,
  description text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_room_types_company_idx ON public.l_room_types (company_id);

CREATE TABLE IF NOT EXISTS public.l_rate_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.l_room_types(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price        numeric NOT NULL,
  notes        text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_rate_plans_company_idx ON public.l_rate_plans (company_id);
CREATE INDEX IF NOT EXISTS l_rate_plans_type_idx ON public.l_rate_plans (room_type_id);

-- A room belongs to at most one type; clearing the type leaves the room intact.
ALTER TABLE public.l_units
  ADD COLUMN IF NOT EXISTS room_type_id uuid REFERENCES public.l_room_types(id) ON DELETE SET NULL;

-- A reservation records which rate plan it was booked on (nightly_rate still
-- holds the agreed price, so deleting a plan never changes a booked figure).
ALTER TABLE public.l_reservations
  ADD COLUMN IF NOT EXISTS rate_plan_id uuid REFERENCES public.l_rate_plans(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
