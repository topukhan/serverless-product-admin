-- =====================================================================
-- Migration: theme palettes
-- Adds a `themes` table with full color palettes, plus an
-- `active_theme_id` pointer on `settings`. Seeds three default themes.
-- Run AFTER schema.sql. Idempotent.
-- =====================================================================

-- ---------- Table ----------
create table if not exists public.themes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  -- Surface tones
  bg            text not null,    -- page background
  surface       text not null,    -- cards / elevated panels
  border        text not null,    -- subtle dividers
  -- Typography
  text_color    text not null,    -- primary text
  muted         text not null,    -- secondary / hint text
  -- Brand
  primary_color text not null,
  primary_hover text not null,
  secondary_color text not null,
  accent_color  text not null,    -- stars, highlights
  created_at    timestamptz not null default now()
);

-- ---------- Settings.active_theme_id ----------
alter table public.settings
  add column if not exists active_theme_id uuid
    references public.themes(id) on delete set null;

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
  using  (public.is_admin())
  with check (public.is_admin());

-- ---------- Seed three themes ----------
-- Sand (default, Hayatiq-inspired): cream + sage
insert into public.themes (name, bg, surface, border, text_color, muted,
                           primary_color, primary_hover, secondary_color, accent_color)
values ('Sand',
  '#f7f3ed', '#ffffff', '#e8e1d4',
  '#1f1c18', '#6b6358',
  '#5a6b4a', '#4a5a3c', '#a89580', '#c8956d')
on conflict (name) do nothing;

-- Slate: cool gray + deep navy
insert into public.themes (name, bg, surface, border, text_color, muted,
                           primary_color, primary_hover, secondary_color, accent_color)
values ('Slate',
  '#f6f7f9', '#ffffff', '#e2e6eb',
  '#0f172a', '#64748b',
  '#1e3a5f', '#152a45', '#64748b', '#d4a373')
on conflict (name) do nothing;

-- Forest: green-tinted neutrals + deep forest
insert into public.themes (name, bg, surface, border, text_color, muted,
                           primary_color, primary_hover, secondary_color, accent_color)
values ('Forest',
  '#f5f7f3', '#ffffff', '#dde5d6',
  '#1a1f1c', '#5a6359',
  '#2d5a3f', '#1f4530', '#7a8a6e', '#b8854a')
on conflict (name) do nothing;

-- Set Sand as the default active theme if nothing is selected.
update public.settings
   set active_theme_id = (select id from public.themes where name = 'Sand')
 where id = 1 and active_theme_id is null;
