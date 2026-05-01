-- =====================================================================
-- 05 / Banner slides
--   Admin-managed carousel slides shown on the home page hero section.
-- =====================================================================

create table if not exists public.banner_slides (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  subtitle   text,
  image_url  text,
  cta_text   text,
  cta_url    text,
  sort_order integer not null default 0,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.banner_slides enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'banner_slides'
  loop
    execute format('drop policy if exists %I on public.banner_slides', r.policyname);
  end loop;
end $$;

create policy "banner_slides: public read"
  on public.banner_slides for select using (enabled = true or public.is_admin());
create policy "banner_slides: admin write"
  on public.banner_slides for all using (public.is_admin()) with check (public.is_admin());

grant select                         on public.banner_slides to anon;
grant select, insert, update, delete on public.banner_slides to authenticated;
