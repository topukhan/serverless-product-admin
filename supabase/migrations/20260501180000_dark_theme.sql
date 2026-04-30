-- =====================================================================
-- Migration: Dark theme support
-- Adds an optional `dark_theme_id` to settings so the public site can
-- switch between a light and dark palette via a header toggle. Seeds a
-- "Midnight" theme to use as the default dark variant. Run AFTER prior
-- migrations. Idempotent.
-- =====================================================================

-- ---------- Seed a Midnight (dark) theme ----------
insert into public.themes (
  name, bg, surface, border, text_color, muted,
  primary_color, primary_hover, secondary_color, accent_color
)
values (
  'Midnight',
  '#0f1115', '#1a1d23', '#2a2e36',
  '#e8e6e1', '#9aa0a8',
  '#9bb886', '#a8c690', '#7a8a6e', '#d4a373'
)
on conflict (name) do nothing;

-- ---------- settings.dark_theme_id ----------
alter table public.settings
  add column if not exists dark_theme_id uuid
    references public.themes(id) on delete set null;

-- Default the dark slot to Midnight if nothing is set.
update public.settings
   set dark_theme_id = (select id from public.themes where name = 'Midnight')
 where id = 1 and dark_theme_id is null;
