-- =====================================================================
-- 06 / Banner enhancements + product display order
-- =====================================================================

-- Text alignment + CTA type columns for banner_slides
alter table public.banner_slides
  add column if not exists text_align     text not null default 'left'
    check (text_align in ('left','center','right')),
  add column if not exists cta_type       text not null default 'url'
    check (cta_type in ('url','product','category')),
  add column if not exists cta_product_id  uuid references public.products(id)  on delete set null,
  add column if not exists cta_category_id uuid references public.categories(id) on delete set null;

-- Drop the old cta_url NOT NULL constraint if it exists (url is now optional)
-- (column already exists from migration 05, just leave it nullable by default)

-- Banners storage bucket
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and policyname in ('storage: public read banners','storage: admin write banners')
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "storage: public read banners"
  on storage.objects for select using (bucket_id = 'banners');
create policy "storage: admin write banners"
  on storage.objects for all
  using  (bucket_id = 'banners' and public.is_admin())
  with check (bucket_id = 'banners' and public.is_admin());

-- Product display order
alter table public.products
  add column if not exists display_order integer not null default 0;

create index if not exists idx_products_display_order
  on public.products (display_order asc, created_at desc);
