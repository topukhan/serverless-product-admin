-- =====================================================================
-- Migration: products.sold counter + show_sold feature flag
-- Admins type a sold count into the product editor; public displays it
-- (e.g. "120 sold") only when the show_sold flag is on.
-- Run AFTER schema.sql. Idempotent.
-- =====================================================================

alter table public.products
  add column if not exists sold integer not null default 0;

alter table public.products
  drop constraint if exists products_sold_nonneg;

alter table public.products
  add constraint products_sold_nonneg check (sold >= 0);

-- Default the new flag on existing settings rows. Merge so any existing
-- flags stay intact.
update public.settings
   set flags = '{"show_sold": true}'::jsonb || coalesce(flags, '{}'::jsonb)
 where id = 1;
