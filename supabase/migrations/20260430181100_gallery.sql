-- =====================================================================
-- Migration: product gallery (up to 3 images per product, plus thumbnail)
-- The existing `image_url` column stays as the thumbnail.
-- New `gallery_urls` column holds 0..3 additional images.
-- Run AFTER schema.sql. Idempotent.
-- =====================================================================

alter table public.products
  add column if not exists gallery_urls text[] not null default '{}';

alter table public.products
  drop constraint if exists products_gallery_max_3;

alter table public.products
  add constraint products_gallery_max_3
  check (cardinality(gallery_urls) <= 3);

-- ---------- Populate gallery for seeded sample products ---------------
-- Only fills products that currently have an empty gallery, so re-running
-- after admin edits is safe.
update public.products
   set gallery_urls = array[
     'https://picsum.photos/seed/tee-a/800/800',
     'https://picsum.photos/seed/tee-b/800/800',
     'https://picsum.photos/seed/tee-c/800/800'
   ]
 where name = 'Classic Tee' and cardinality(gallery_urls) = 0;

update public.products
   set gallery_urls = array[
     'https://picsum.photos/seed/hoodie-a/800/800',
     'https://picsum.photos/seed/hoodie-b/800/800'
   ]
 where name = 'Hoodie Premium' and cardinality(gallery_urls) = 0;

update public.products
   set gallery_urls = array[
     'https://picsum.photos/seed/sneakers-a/800/800'
   ]
 where name = 'Runner Sneakers' and cardinality(gallery_urls) = 0;

-- 'Leather Belt' intentionally left with no gallery so you can verify
-- the no-gallery fallback (only the thumbnail shows).

update public.products
   set gallery_urls = array[
     'https://picsum.photos/seed/headphones-a/800/800',
     'https://picsum.photos/seed/headphones-b/800/800',
     'https://picsum.photos/seed/headphones-c/800/800'
   ]
 where name = 'Wireless Headphones' and cardinality(gallery_urls) = 0;

-- 'Smartwatch' also intentionally left with no gallery.
