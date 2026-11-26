-- Custom worker roles & permissions. Run once in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS public.l_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.l_companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  protected   boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS l_roles_company_idx ON public.l_roles (company_id);

-- Which custom role a worker is assigned (managers always have full access and
-- ignore this). SET NULL if the role is deleted.
ALTER TABLE public.l_users
  ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES public.l_roles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
