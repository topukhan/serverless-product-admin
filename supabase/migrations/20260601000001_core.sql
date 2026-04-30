-- =====================================================================
-- 01 / Core schema
--   Catalog tables, settings singleton, admin role, RLS, storage buckets.
--   Idempotent: safe to re-run on an existing project.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Categories ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Products ----------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price        numeric(12,2) not null default 0 check (price >= 0),
  stock        integer not null default 0 check (stock >= 0),
  image_url    text,
  gallery_urls text[] not null default '{}',
  sold_count   integer not null default 0 check (sold_count >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists idx_products_created_at on public.products (created_at desc);

-- ---------- Product ↔ Category junction ----------
create table if not exists public.product_categories (
  product_id  uuid not null references public.products(id)   on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (product_id, category_id)
);
create index if not exists idx_prodcats_category_id on public.product_categories (category_id);

-- ---------- Reviews ----------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_name   text not null,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_reviews_product_id on public.reviews (product_id);

-- ---------- Questions ----------
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  question    text not null,
  answer      text,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_questions_product_id on public.questions (product_id);

-- ---------- Settings (singleton) ----------
create table if not exists public.settings (
  id                              integer primary key default 1,
  site_name                       text not null default 'My Store',
  logo_url                        text,
  favicon_url                     text,
  font_family                     text not null default 'ui-sans-serif, system-ui, sans-serif',
  flags                           jsonb not null default '{}'::jsonb,
  active_theme_id                 uuid,
  order_rate_limit_count          integer not null default 5,
  order_rate_limit_minutes        integer not null default 15,
  delivery_charge_inside_dhaka    numeric(12,2) not null default 60,
  delivery_charge_outside_dhaka   numeric(12,2) not null default 130,
  delivery_label_inside_dhaka     text not null default 'Inside Dhaka',
  delivery_label_outside_dhaka    text not null default 'Outside Dhaka',
  updated_at                      timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- Seed sensible default flags on first run; merge so existing flags survive.
update public.settings
   set flags = '{"show_stock": true, "show_sold": true}'::jsonb || coalesce(flags, '{}'::jsonb)
 where id = 1;

-- ---------- Admin role ----------
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
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.product_categories enable row level security;
alter table public.reviews            enable row level security;
alter table public.questions          enable row level security;
alter table public.settings           enable row level security;
alter table public.admins             enable row level security;

-- Drop pre-existing policies for idempotency.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('categories','products','product_categories',
                        'reviews','questions','settings','admins')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Categories: public reads only enabled rows; admin sees all + writes.
create policy "categories: public read"
  on public.categories for select using (enabled = true or public.is_admin());
create policy "categories: admin write"
  on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- Products: public read all; admin write.
create policy "products: public read" on public.products for select using (true);
create policy "products: admin write"
  on public.products for all using (public.is_admin()) with check (public.is_admin());

-- Junction: public read; admin write.
create policy "product_categories: public read" on public.product_categories for select using (true);
create policy "product_categories: admin write"
  on public.product_categories for all using (public.is_admin()) with check (public.is_admin());

-- Reviews: public reads enabled; public can insert (must default enabled = true);
-- only admin can update/delete.
create policy "reviews: public read"
  on public.reviews for select using (enabled = true or public.is_admin());
create policy "reviews: public insert"
  on public.reviews for insert with check (enabled = true);
create policy "reviews: admin update"
  on public.reviews for update using (public.is_admin()) with check (public.is_admin());
create policy "reviews: admin delete"
  on public.reviews for delete using (public.is_admin());

-- Questions: public reads enabled; public can ask but cannot pre-fill answer.
create policy "questions: public read"
  on public.questions for select using (enabled = true or public.is_admin());
create policy "questions: public insert"
  on public.questions for insert with check (answer is null and enabled = true);
create policy "questions: admin update"
  on public.questions for update using (public.is_admin()) with check (public.is_admin());
create policy "questions: admin delete"
  on public.questions for delete using (public.is_admin());

-- Settings: public read (so the public site can fetch branding); admin updates.
create policy "settings: public read"
  on public.settings for select using (true);
create policy "settings: admin update"
  on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- Admins table: admins can see who is an admin. Promotion is manual via SQL.
create policy "admins: admin read"
  on public.admins for select using (public.is_admin());

-- ---------- Storage buckets ----------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

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
  on storage.objects for select using (bucket_id = 'products');
create policy "storage: admin write products"
  on storage.objects for all
  using  (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());

create policy "storage: public read branding"
  on storage.objects for select using (bucket_id = 'branding');
create policy "storage: admin write branding"
  on storage.objects for all
  using  (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());
