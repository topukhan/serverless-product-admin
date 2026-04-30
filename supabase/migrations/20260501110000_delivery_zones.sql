-- =====================================================================
-- Migration: Delivery zones (inside Dhaka / outside Dhaka)
-- Replaces the single `default_delivery_charge` setting with two zone
-- columns + adds `delivery_zone` to orders. Re-creates place_order to
-- accept a zone and pick the matching charge.
-- Run AFTER 20260501100000_orders.sql. Idempotent.
-- =====================================================================

-- ---------- Settings: two zone-specific charges ----------
alter table public.settings
  add column if not exists delivery_charge_inside_dhaka  numeric(12,2) not null default 60,
  add column if not exists delivery_charge_outside_dhaka numeric(12,2) not null default 130;

-- Migrate any pre-existing default_delivery_charge value into the inside zone
-- (best-effort — this is a fresh install pattern, but handles upgrades too).
do $$
declare v numeric(12,2);
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings'
      and column_name = 'default_delivery_charge'
  ) then
    select default_delivery_charge into v from public.settings where id = 1;
    if v is not null and v > 0 then
      update public.settings
         set delivery_charge_inside_dhaka = v
       where id = 1
         and delivery_charge_inside_dhaka = 60; -- only if still default
    end if;
    -- Drop the old column so the schema stays clean.
    alter table public.settings drop column default_delivery_charge;
  end if;
end $$;

-- ---------- Orders: which zone the customer picked ----------
alter table public.orders
  add column if not exists delivery_zone text;

-- Constrain values once the column exists (drop & recreate for idempotency).
alter table public.orders drop constraint if exists orders_delivery_zone_check;
alter table public.orders add constraint orders_delivery_zone_check
  check (delivery_zone is null or delivery_zone in ('inside_dhaka','outside_dhaka'));

-- =====================================================================
-- RPC: place_order  (replaces previous version)
-- Same shape as before but reads delivery_zone from payload and applies the
-- matching zone charge.
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
  inside_fee   numeric(12,2);
  outside_fee  numeric(12,2);
  recent_count integer;
  v_subtotal   numeric(12,2) := 0;
  v_total      numeric(12,2);
  v_charge     numeric(12,2);
  v_zone       text := lower(coalesce(payload->>'delivery_zone',''));
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
  if v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'empty_cart' using errcode = '22000';
  end if;

  select order_rate_limit_count, order_rate_limit_minutes,
         delivery_charge_inside_dhaka, delivery_charge_outside_dhaka
    into rate_count, rate_minutes, inside_fee, outside_fee
    from public.settings where id = 1;

  v_charge := case when v_zone = 'inside_dhaka' then inside_fee else outside_fee end;

  -- Phone-based rate limit (last N minutes).
  select count(*) into recent_count
    from public.orders
   where customer_phone = v_phone
     and placed_at > now() - make_interval(mins => rate_minutes);

  if recent_count >= rate_count then
    raise exception 'rate_limit' using errcode = '22000';
  end if;

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

  v_total := v_subtotal + coalesce(v_charge, 0);

  insert into public.orders (
    id, order_number, status, customer_name, customer_phone, customer_address,
    customer_note, delivery_zone, subtotal, discount_amount, charge_amount, total_amount
  ) values (
    v_order_id, v_number, 'pending', v_name, v_phone, v_address,
    v_note, v_zone, v_subtotal, 0, coalesce(v_charge, 0), v_total
  );

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
    'charge_amount', coalesce(v_charge, 0),
    'total_amount', v_total,
    'delivery_zone', v_zone
  );
end $$;

grant execute on function public.place_order(jsonb) to anon, authenticated;

-- =====================================================================
-- RPC: get_order_view  (re-create to include delivery_zone)
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
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'product_name', product_name,
    'product_price', product_price, 'quantity', quantity, 'line_total', line_total
  ) order by product_name), '[]'::jsonb)
  into v_items from public.order_items where order_id = v_order.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'from_status', from_status, 'to_status', to_status,
    'note', note, 'created_at', created_at
  ) order by created_at), '[]'::jsonb)
  into v_events from public.order_events where order_id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'customer_name', v_order.customer_name,
    'customer_phone', v_order.customer_phone,
    'customer_address', v_order.customer_address,
    'customer_note', v_order.customer_note,
    'delivery_zone', v_order.delivery_zone,
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
