-- =====================================================================
-- 09 / Admin-created orders + admin note
--   Adds:
--     - orders.source       : 'customer' | 'admin'  (origin of the order)
--     - orders.admin_note   : free-form note maintained by admin (any state)
--   Adds RPCs:
--     - create_admin_order(payload jsonb)         : admin places an order
--     - update_admin_note(p_order_id, p_note)     : edit admin note any time
-- =====================================================================

alter table public.orders
  add column if not exists source text not null default 'customer'
    check (source in ('customer','admin'));

alter table public.orders
  add column if not exists admin_note text;

create index if not exists idx_orders_source on public.orders (source);

-- =====================================================================
-- RPC: create_admin_order
--   Admin-only. Skips public rate limiting and stock checks (admin can
--   take pre-orders); stock is still deducted on the approval transition
--   the same way as customer orders.
--
--   payload shape:
--     {
--       customer_name, customer_phone, customer_address,
--       customer_note?, admin_note?, delivery_zone?,
--       discount_amount?, charge_amount?,
--       items: [ { product_id, qty } ]
--     }
-- =====================================================================
create or replace function public.create_admin_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(0, coalesce((payload->>'discount_amount')::numeric, 0));
  v_charge   numeric(12,2) := greatest(0, coalesce((payload->>'charge_amount')::numeric, 0));
  v_total    numeric(12,2);
  v_zone     text := nullif(lower(coalesce(payload->>'delivery_zone','')), '');
  v_phone    text := trim(coalesce(payload->>'customer_phone',''));
  v_name     text := trim(coalesce(payload->>'customer_name',''));
  v_address  text := trim(coalesce(payload->>'customer_address',''));
  v_note     text := nullif(trim(coalesce(payload->>'customer_note','')), '');
  v_admin    text := nullif(trim(coalesce(payload->>'admin_note','')), '');
  v_items    jsonb := payload->'items';
  v_order_id uuid := gen_random_uuid();
  v_number   text := next_order_number();
  item       jsonb;
  v_product  public.products%rowtype;
  v_qty      integer;
  v_line     numeric(12,2);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  if length(v_name) < 2 then    raise exception 'invalid_name'    using errcode = '22000'; end if;
  if length(v_phone) < 7 then   raise exception 'invalid_phone'   using errcode = '22000'; end if;
  if length(v_address) < 5 then raise exception 'invalid_address' using errcode = '22000'; end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'empty_cart' using errcode = '22000';
  end if;

  for item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := coalesce((item->>'qty')::integer, 0);
    if v_qty <= 0 then raise exception 'invalid_qty' using errcode = '22000'; end if;
    select * into v_product from public.products where id = (item->>'product_id')::uuid;
    if not found then raise exception 'product_missing' using errcode = '22000'; end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  v_total := greatest(0, v_subtotal + v_charge - v_discount);

  insert into public.orders (
    id, order_number, status, source,
    customer_name, customer_phone, customer_address, customer_note,
    admin_note, delivery_zone,
    subtotal, discount_amount, charge_amount, total_amount,
    viewed_at
  ) values (
    v_order_id, v_number, 'pending', 'admin',
    v_name, v_phone, v_address, v_note,
    v_admin, v_zone,
    v_subtotal, v_discount, v_charge, v_total,
    now()
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

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (v_order_id, null, 'pending', 'Order created by admin', auth.uid());

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_number,
    'total_amount', v_total
  );
end $$;
grant execute on function public.create_admin_order(jsonb) to authenticated;

-- =====================================================================
-- RPC: update_admin_note — admin only, editable in any state
-- =====================================================================
create or replace function public.update_admin_note(
  p_order_id uuid, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text := nullif(trim(coalesce(p_note,'')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.orders set admin_note = v_clean, updated_at = now()
   where id = p_order_id;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;
  return jsonb_build_object('ok', true, 'admin_note', v_clean);
end $$;
grant execute on function public.update_admin_note(uuid, text) to authenticated;
