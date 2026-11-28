-- Wallpaper (OS-style desktop background) + configurable taxes. Run once.
--
-- wallpaper : a preset key (or empty for the role default) for the app-wide
--             desktop wallpaper.
-- taxes     : a list of tax / service-charge lines applied to folios & invoices,
--             each {name, rate, enabled}.

ALTER TABLE public.l_settings
  ADD COLUMN IF NOT EXISTS wallpaper text,
  ADD COLUMN IF NOT EXISTS taxes jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
