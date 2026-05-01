-- =====================================================================
-- 02 / Themes
--   A theme is a complete brand: it owns BOTH a light palette and a dark
--   palette. Admin picks one active theme; visitors flip between its two
--   variants via the header toggle.
-- =====================================================================

create table if not exists public.themes (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,

  -- Light palette
  light_bg            text not null,
  light_surface       text not null,
  light_border        text not null,
  light_text          text not null,
  light_muted         text not null,
  light_primary       text not null,
  light_primary_hover text not null,
  light_secondary     text not null,
  light_accent        text not null,

  -- Dark palette
  dark_bg             text not null,
  dark_surface        text not null,
  dark_border         text not null,
  dark_text           text not null,
  dark_muted          text not null,
  dark_primary        text not null,
  dark_primary_hover  text not null,
  dark_secondary      text not null,
  dark_accent         text not null,

  created_at          timestamptz not null default now()
);

-- settings.active_theme_id was declared in 01_core; wire the FK now that
-- themes exists. Use ALTER … ADD CONSTRAINT IF NOT EXISTS via DO-block.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_active_theme_id_fkey'
  ) then
    alter table public.settings
      add constraint settings_active_theme_id_fkey
      foreign key (active_theme_id) references public.themes(id) on delete set null;
  end if;
end $$;

-- ---------- RLS ----------
alter table public.themes enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'themes'
  loop
    execute format('drop policy if exists %I on public.themes', r.policyname);
  end loop;
end $$;

create policy "themes: public read"
  on public.themes for select using (true);
create policy "themes: admin write"
  on public.themes for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Seed: 3 starter themes, each with both palettes ----------
-- Sand (warm, default)
insert into public.themes (
  name,
  light_bg, light_surface, light_border, light_text, light_muted,
  light_primary, light_primary_hover, light_secondary, light_accent,
  dark_bg, dark_surface, dark_border, dark_text, dark_muted,
  dark_primary, dark_primary_hover, dark_secondary, dark_accent
) values (
  'Sand',
  '#f7f3ed', '#ffffff', '#e8e1d4', '#1f1c18', '#6b6358',
  '#5a6b4a', '#4a5a3c', '#a89580', '#c8956d',
  '#0f1115', '#1a1d23', '#2a2e36', '#e8e6e1', '#9aa0a8',
  '#9bb886', '#a8c690', '#7a8a6e', '#d4a373'
)
on conflict (name) do nothing;

-- Slate (cool)
insert into public.themes (
  name,
  light_bg, light_surface, light_border, light_text, light_muted,
  light_primary, light_primary_hover, light_secondary, light_accent,
  dark_bg, dark_surface, dark_border, dark_text, dark_muted,
  dark_primary, dark_primary_hover, dark_secondary, dark_accent
) values (
  'Slate',
  '#f6f7f9', '#ffffff', '#e2e6eb', '#0f172a', '#64748b',
  '#1e3a5f', '#152a45', '#64748b', '#d4a373',
  '#0b1220', '#141d2d', '#22304a', '#e2e8f0', '#94a3b8',
  '#7aa6d8', '#9cbfe5', '#64748b', '#d4a373'
)
on conflict (name) do nothing;

-- Forest (green)
insert into public.themes (
  name,
  light_bg, light_surface, light_border, light_text, light_muted,
  light_primary, light_primary_hover, light_secondary, light_accent,
  dark_bg, dark_surface, dark_border, dark_text, dark_muted,
  dark_primary, dark_primary_hover, dark_secondary, dark_accent
) values (
  'Forest',
  '#f5f7f3', '#ffffff', '#dde5d6', '#1a1f1c', '#5a6359',
  '#2d5a3f', '#1f4530', '#7a8a6e', '#b8854a',
  '#0e1410', '#16201a', '#27322a', '#e8efe8', '#9aa89c',
  '#7fb592', '#9bcbab', '#7a8a6e', '#b8854a'
)
on conflict (name) do nothing;

-- Midnight (deep indigo / blue)
insert into public.themes (
  name,
  light_bg, light_surface, light_border, light_text, light_muted,
  light_primary, light_primary_hover, light_secondary, light_accent,
  dark_bg, dark_surface, dark_border, dark_text, dark_muted,
  dark_primary, dark_primary_hover, dark_secondary, dark_accent
) values (
  'Midnight',
  '#f4f6fb', '#ffffff', '#d8dde9', '#0e1736', '#5b6783',
  '#1e2a78', '#15205e', '#4a5680', '#8b6cd6',
  '#060814', '#0d1228', '#1c2546', '#e6eaff', '#8b94b8',
  '#6b7dff', '#8593ff', '#4a5680', '#b298ff'
)
on conflict (name) do nothing;

-- Set Sand as the active theme on first run if nothing is selected.
update public.settings
   set active_theme_id = (select id from public.themes where name = 'Sand')
 where id = 1 and active_theme_id is null;

-- ---------- Table grants ----------
grant select                         on public.themes to anon;
grant select, insert, update, delete on public.themes to authenticated;
