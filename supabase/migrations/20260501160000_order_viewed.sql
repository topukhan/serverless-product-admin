-- =====================================================================
-- Migration: order viewed tracking
-- Adds `viewed_at` to orders. The "newly received" badge in the admin nav
-- counts only pending orders that haven't been opened yet. Once an admin
-- opens the order detail, viewed_at is set and the count drops.
-- Run AFTER prior migrations. Idempotent.
-- =====================================================================

alter table public.orders
  add column if not exists viewed_at timestamptz;

create index if not exists idx_orders_pending_unviewed
  on public.orders (placed_at desc)
  where status = 'pending' and viewed_at is null;

-- Re-create the pending count function so it only returns unviewed rows.
create or replace function public.get_pending_order_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_admin()
              then (select count(*)::int from public.orders
                    where status = 'pending' and viewed_at is null)
              else 0
         end;
$$;
