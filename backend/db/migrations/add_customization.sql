-- App customization: per-workspace branding accent, default theme, and which
-- modules are hidden. Run once in the Supabase SQL editor. Safe to re-run.
ALTER TABLE public.l_settings
  ADD COLUMN IF NOT EXISTS accent_color    text,
  ADD COLUMN IF NOT EXISTS default_theme   text,
  ADD COLUMN IF NOT EXISTS hidden_features jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Let PostgREST see the new columns immediately.
NOTIFY pgrst, 'reload schema';
