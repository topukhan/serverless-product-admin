-- =====================================================================
-- Phase 1: Schema + RLS for Dynamic Product Showcase
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS where appropriate.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";  -- for gen_random_uuid()


-- =====================================================================
-- 1. TABLES
-- =====================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric(12,2) not null default 0 check (price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  image_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists public.product_categories (
  product_id  uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_name   text not null,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  question    text not null,
  answer      text,
  created_at  timestamptz not null default now()
);

-- Single-row settings table for branding. Enforced via the singleton check below.
create table if not exists public.settings (
  id              integer primary key default 1,
  site_name       text not null default 'My Store',
  logo_url        text,
  favicon_url     text,
  primary_color   text not null default '#4f46e5',
  secondary_color text not null default '#0ea5e9',
  accent_color    text not null default '#f59e0b',
  font_family     text not null default 'Inter, sans-serif',
  updated_at      timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

-- Seed the single settings row (idempotent).
insert into public.settings (id) values (1)
on conflict (id) do nothing;


-- =====================================================================
-- 2. ADMIN ROLE
-- =====================================================================
-- We do NOT rely on Supabase auth roles. Instead, an `admins` table lists
-- which auth.users are admins. This keeps RLS policies simple and explicit.

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

-- Allow the anon and authenticated roles to call is_admin() from RLS.
grant execute on function public.is_admin() to anon, authenticated;


-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.product_categories  enable row level security;
alter table public.reviews             enable row level security;
alter table public.questions           enable row level security;
alter table public.settings            enable row level security;
alter table public.admins              enable row level security;

-- Drop any pre-existing policies so this script is idempotent.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'categories','products','product_categories',
        'reviews','questions','settings','admins'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------- products ----------
create policy "products: public read"
  on public.products for select
  using (true);

create policy "products: admin write"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- categories ----------
create policy "categories: public read"
  on public.categories for select
  using (true);

create policy "categories: admin write"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- product_categories (junction) ----------
create policy "product_categories: public read"
  on public.product_categories for select
  using (true);

create policy "product_categories: admin write"
  on public.product_categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- reviews ----------
-- Public can read all reviews and submit new ones. Only admin can edit/delete.
create policy "reviews: public read"
  on public.reviews for select
  using (true);

create policy "reviews: public insert"
  on public.reviews for insert
  with check (true);

create policy "reviews: admin update"
  on public.reviews for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "reviews: admin delete"
  on public.reviews for delete
  using (public.is_admin());

-- ---------- questions ----------
-- Public can read and ask. Only admin can answer (update) or delete.
create policy "questions: public read"
  on public.questions for select
  using (true);

create policy "questions: public insert"
  on public.questions for insert
  with check (answer is null);   -- visitors cannot pre-fill answers

create policy "questions: admin update"
  on public.questions for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "questions: admin delete"
  on public.questions for delete
  using (public.is_admin());

-- ---------- settings ----------
-- Public can read branding. Only admin can update. No insert/delete (singleton).
create policy "settings: public read"
  on public.settings for select
  using (true);

create policy "settings: admin update"
  on public.settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- admins ----------
-- Admins can see who is an admin. Nobody can self-promote via the API;
-- new admins are added manually in the SQL Editor (see setup notes).
create policy "admins: admin read"
  on public.admins for select
  using (public.is_admin());


-- =====================================================================
-- 4. STORAGE BUCKETS
-- =====================================================================
-- Two public buckets: product images and branding assets (logo/favicon).
-- Public read so <img> tags work without signed URLs; admin-only writes.

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Storage policies. Drop-and-recreate for idempotency.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'storage: public read products',
        'storage: admin write products',
        'storage: public read branding',
        'storage: admin write branding'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "storage: public read products"
  on storage.objects for select
  using (bucket_id = 'products');

create policy "storage: admin write products"
  on storage.objects for all
  using  (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());

create policy "storage: public read branding"
  on storage.objects for select
  using (bucket_id = 'branding');

create policy "storage: admin write branding"
  on storage.objects for all
  using  (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());


-- =====================================================================
-- 5. INDEXES
-- =====================================================================

create index if not exists idx_products_created_at      on public.products (created_at desc);
create index if not exists idx_reviews_product_id       on public.reviews (product_id);
create index if not exists idx_questions_product_id     on public.questions (product_id);
create index if not exists idx_prodcats_category_id     on public.product_categories (category_id);
