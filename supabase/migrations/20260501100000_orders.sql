-- =====================================================================
-- Migration: Orders + admin order management
-- Tables: orders, order_items, order_events
-- Settings: order_rate_limit_count, order_rate_limit_minutes,
--           default_delivery_charge
-- RPCs: place_order, update_order_status, find_order_lookup,
--       get_order_view, get_dashboard_stats
-- Run AFTER prior migrations. Idempotent.
-- =====================================================================

-- ---------- Status enum (use plain text + check for simplicity / re-run) ----------
-- We store status as text + check constraint instead of a Postgres ENUM so
-- adding/removing a value later doesn't require a separate migration dance.

-- ---------- Order number sequence ----------
create sequence if not exists public.order_number_seq start 1000;

create or replace function public.next_order_number()
returns text
language sql
as $$
  select 'ORD-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
$$;

-- ---------- orders ----------
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null unique,
  status             text not null default 'pending',
  customer_name      text not null,
  customer_phone     text not null,
  customer_address   text not null,
  customer_note      text,
  subtotal           numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_amount    numeric(12,2) not null default 0 check (discount_amount >= 0),
  charge_amount      numeric(12,2) not null default 0 check (charge_amount >= 0),
  total_amount       numeric(12,2) not null default 0 check (total_amount >= 0),
  tracking_id        text,
  placed_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint orders_status_check check (
    status in ('pending','approved','shipped','delivered','cancelled','returned')
  )
);

create index if not exists idx_orders_status     on public.orders (status);
create index if not exists idx_orders_placed_at  on public.orders (placed_at desc);
create index if not exists idx_orders_phone      on public.orders (customer_phone);
create index if not exists idx_orders_tracking   on public.orders (tracking_id);

-- ---------- order_items ----------
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  product_name   text not null,
  product_price  numeric(12,2) not null check (product_price >= 0),
  quantity       integer not null check (quantity > 0),
  line_total     numeric(12,2) not null check (line_total >= 0)
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- ---------- order_events (status timeline) ----------
create table if not exists public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_order_events_order on public.order_events (order_id, created_at);

-- ---------- Settings additions ----------
alter table public.settings
  add column if not exists order_rate_limit_count integer not null default 5,
  add column if not exists order_rate_limit_minutes integer not null default 15,
  add column if not exists default_delivery_charge numeric(12,2) not null default 0;

-- ---------- RLS ----------
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.order_events  enable row level security;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('orders','order_items','order_events')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- All public access goes through SECURITY DEFINER RPCs below; direct table
-- access is admin-only. This keeps anon clients from listing orders.
create policy "orders: admin all" on public.orders for all
  using (public.is_admin()) with check (public.is_admin());

create policy "order_items: admin all" on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

create policy "order_events: admin all" on public.order_events for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- RPC: place_order
-- Validates rate limit + per-product stock availability, snapshots product
-- fields into order_items, returns order_number for redirect.
-- Stock is NOT decremented here — admin must "approve" first.
-- =====================================================================
create or replace function public.place_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rate_count   integer;
  rate_minutes integer;
  delivery     numeric(12,2);
  recent_count integer;
  v_subtotal   numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_phone      text := trim(coalesce(payload->>'customer_phone',''));
  v_name       text := trim(coalesce(payload->>'customer_name',''));
  v_address    text := trim(coalesce(payload->>'customer_address',''));
  v_note       text := nullif(trim(coalesce(payload->>'customer_note','')), '');
  v_items      jsonb := payload->'items';
  v_order_id   uuid := gen_random_uuid();
  v_number     text := next_order_number();
  item         jsonb;
  v_product    public.products%rowtype;
  v_qty        integer;
  v_line       numeric(12,2);
begin
  if length(v_name) < 2 then
    raise exception 'invalid_name' using errcode = '22000';
  end if;
  if length(v_phone) < 7 then
    raise exception 'invalid_phone' using errcode = '22000';
  end if;
  if length(v_address) < 5 then
    raise exception 'invalid_address' using errcode = '22000';
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'empty_cart' using errcode = '22000';
  end if;

  select order_rate_limit_count, order_rate_limit_minutes, default_delivery_charge
    into rate_count, rate_minutes, delivery
    from public.settings where id = 1;

  -- Phone-based rate limit (last N minutes).
  select count(*) into recent_count
    from public.orders
   where customer_phone = v_phone
     and placed_at > now() - make_interval(mins => rate_minutes);

  if recent_count >= rate_count then
    raise exception 'rate_limit' using errcode = '22000';
  end if;

  -- Validate every item & compute subtotal. Lock product rows briefly.
  for item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := coalesce((item->>'qty')::integer, 0);
    if v_qty <= 0 then
      raise exception 'invalid_qty' using errcode = '22000';
    end if;
    select * into v_product from public.products
      where id = (item->>'product_id')::uuid for update;
    if not found then
      raise exception 'product_missing' using errcode = '22000';
    end if;
    if v_product.stock < v_qty then
      raise exception 'insufficient_stock:%', v_product.name using errcode = '22000';
    end if;
    v_line := v_product.price * v_qty;
    v_subtotal := v_subtotal + v_line;
  end loop;

  v_total := v_subtotal + coalesce(delivery, 0);

  insert into public.orders (
    id, order_number, status, customer_name, customer_phone, customer_address,
    customer_note, subtotal, discount_amount, charge_amount, total_amount
  ) values (
    v_order_id, v_number, 'pending', v_name, v_phone, v_address,
    v_note, v_subtotal, 0, coalesce(delivery, 0), v_total
  );

  -- Insert items (re-walk; rows were locked above so values are stable).
  for item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := (item->>'qty')::integer;
    select * into v_product from public.products where id = (item->>'product_id')::uuid;
    insert into public.order_items (
      order_id, product_id, product_name, product_price, quantity, line_total
    ) values (
      v_order_id, v_product.id, v_product.name, v_product.price,
      v_qty, v_product.price * v_qty
    );
  end loop;

  insert into public.order_events (order_id, from_status, to_status, note)
    values (v_order_id, null, 'pending', 'Order placed');

  return jsonb_build_object(
    'order_number', v_number,
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'charge_amount', coalesce(delivery, 0),
    'total_amount', v_total
  );
end $$;

grant execute on function public.place_order(jsonb) to anon, authenticated;

-- =====================================================================
-- RPC: get_order_view  (public lookup by order_number)
-- Anyone with the order number can view the order. Returns the order +
-- items (no internal admin notes). Used by the customer-side invoice +
-- track-order pages.
-- =====================================================================
create or replace function public.get_order_view(p_order_number text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_items  jsonb;
  v_events jsonb;
begin
  select * into v_order from public.orders where order_number = p_order_number;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', product_id,
    'product_name', product_name,
    'product_price', product_price,
    'quantity', quantity,
    'line_total', line_total
  ) order by product_name), '[]'::jsonb)
  into v_items
  from public.order_items where order_id = v_order.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'from_status', from_status,
    'to_status', to_status,
    'note', note,
    'created_at', created_at
  ) order by created_at), '[]'::jsonb)
  into v_events
  from public.order_events where order_id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'customer_address', v_order.customer_address,
    'customer_note', v_order.customer_note,
    'subtotal', v_order.subtotal,
    'discount_amount', v_order.discount_amount,
    'charge_amount', v_order.charge_amount,
    'total_amount', v_order.total_amount,
    'tracking_id', v_order.tracking_id,
    'placed_at', v_order.placed_at,
    'updated_at', v_order.updated_at,
    'items', v_items,
    'events', v_events
  );
end $$;

grant execute on function public.get_order_view(text) to anon, authenticated;

-- =====================================================================
-- RPC: find_order_lookup  (search by order# or tracking_id)
-- Returns the matching order_number (for redirect) or null.
-- =====================================================================
create or replace function public.find_order_lookup(p_query text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select order_number from public.orders
  where order_number = trim(p_query) or tracking_id = trim(p_query)
  limit 1;
$$;

grant execute on function public.find_order_lookup(text) to anon, authenticated;

-- =====================================================================
-- RPC: update_order_status (admin only)
-- Validates legal transitions, applies stock delta, sets tracking id,
-- writes an order_event row.
--
-- Legal transitions:
--   pending   -> approved, cancelled
--   approved  -> shipped,  cancelled
--   shipped   -> delivered, returned
--   delivered -> returned
--   cancelled, returned -> (terminal)
--
-- Stock effect:
--   pending  -> approved   : -qty (deduct)
--   approved -> cancelled  : +qty (restore)
--   shipped  -> returned   : +qty (restore)
--   delivered-> returned   : +qty (restore)
--   pending  -> cancelled  :  0
--   approved -> shipped    :  0
--   shipped  -> delivered  :  0
-- =====================================================================
create or replace function public.update_order_status(
  p_order_id uuid, p_new_status text, p_tracking_id text default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curr text;
  v_legal boolean;
  v_delta_sign integer := 0;     -- -1 = deduct, +1 = restore, 0 = none
  rec record;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_curr from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_missing' using errcode = '22000';
  end if;

  v_legal := case
    when v_curr = 'pending'   and p_new_status in ('approved','cancelled') then true
    when v_curr = 'approved'  and p_new_status in ('shipped','cancelled')  then true
    when v_curr = 'shipped'   and p_new_status in ('delivered','returned') then true
    when v_curr = 'delivered' and p_new_status = 'returned'                 then true
    else false
  end;

  if not v_legal then
    raise exception 'illegal_transition:%->%', v_curr, p_new_status using errcode = '22000';
  end if;

  -- Stock movement.
  if v_curr = 'pending' and p_new_status = 'approved' then
    v_delta_sign := -1;
  elsif v_curr = 'approved' and p_new_status = 'cancelled' then
    v_delta_sign := 1;
  elsif p_new_status = 'returned' then
    v_delta_sign := 1;
  end if;

  if v_delta_sign <> 0 then
    for rec in
      select product_id, quantity from public.order_items
      where order_id = p_order_id and product_id is not null
    loop
      update public.products
         set stock = greatest(0, stock + (v_delta_sign * rec.quantity))
       where id = rec.product_id;
    end loop;
  end if;

  -- Tracking id is required when entering "shipped".
  if p_new_status = 'shipped' then
    if p_tracking_id is null or length(trim(p_tracking_id)) = 0 then
      raise exception 'tracking_required' using errcode = '22000';
    end if;
    update public.orders
       set status = p_new_status,
           tracking_id = trim(p_tracking_id),
           updated_at = now()
     where id = p_order_id;
  else
    update public.orders set status = p_new_status, updated_at = now()
     where id = p_order_id;
  end if;

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (p_order_id, v_curr, p_new_status,
            coalesce(p_note,
              case when p_new_status = 'shipped' then 'Tracking ID: ' || p_tracking_id end),
            auth.uid());

  return jsonb_build_object('ok', true, 'from', v_curr, 'to', p_new_status);
end $$;

grant execute on function public.update_order_status(uuid, text, text, text) to authenticated;

-- =====================================================================
-- RPC: update_order_charges (admin)
-- Lets admin tweak discount / charge while pending or approved. Re-computes
-- total. Logged in events.
-- =====================================================================
create or replace function public.update_order_charges(
  p_order_id uuid, p_discount numeric, p_charge numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_total numeric(12,2);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;
  if v_order.status not in ('pending','approved') then
    raise exception 'locked_status' using errcode = '22000';
  end if;
  if p_discount < 0 or p_charge < 0 then
    raise exception 'invalid_amount' using errcode = '22000';
  end if;

  v_total := greatest(0, v_order.subtotal + coalesce(p_charge, 0) - coalesce(p_discount, 0));

  update public.orders
     set discount_amount = p_discount,
         charge_amount   = p_charge,
         total_amount    = v_total,
         updated_at      = now()
   where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (p_order_id, v_order.status, v_order.status,
            'Charges updated (discount=' || p_discount || ', charge=' || p_charge || ')',
            auth.uid());

  return jsonb_build_object('total_amount', v_total);
end $$;

grant execute on function public.update_order_charges(uuid, numeric, numeric) to authenticated;

-- =====================================================================
-- RPC: get_dashboard_stats (admin)
-- Returns per-status counts + amount totals within an optional date range.
-- =====================================================================
create or replace function public.get_dashboard_stats(
  p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to   timestamptz := coalesce(p_to, now());
  v_rows jsonb;
  v_pending integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(status, jsonb_build_object(
    'count', cnt, 'total', total
  )), '{}'::jsonb)
  into v_rows
  from (
    select status, count(*) as cnt, coalesce(sum(total_amount), 0) as total
    from public.orders
    where placed_at >= v_from and placed_at <= v_to
    group by status
  ) s;

  -- Always-current pending count (independent of the date range, so the
  -- "newly orders" badge stays accurate).
  select count(*) into v_pending from public.orders where status = 'pending';

  return jsonb_build_object(
    'by_status', v_rows,
    'pending_total', v_pending,
    'from', v_from,
    'to', v_to
  );
end $$;

grant execute on function public.get_dashboard_stats(timestamptz, timestamptz) to authenticated;

-- =====================================================================
-- Convenience: pending count exposed to authenticated admins for the nav
-- badge without pulling rows.
-- =====================================================================
create or replace function public.get_pending_order_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_admin()
              then (select count(*)::int from public.orders where status = 'pending')
              else 0
         end;
$$;

grant execute on function public.get_pending_order_count() to authenticated;
