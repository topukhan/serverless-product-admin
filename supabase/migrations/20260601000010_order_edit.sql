-- =====================================================================
-- 10 / Edit pending orders (admin)
--   Allows admins to fully replace customer fields, items, charges, notes
--   and zone for an order while it is still in 'pending' status. Stock is
--   not touched here — pending orders have not deducted stock yet, so
--   replacing items is safe. Approval will deduct based on the new items.
-- =====================================================================

create or replace function public.update_order_pending(
  p_order_id uuid, payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curr     text;
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
  item       jsonb;
  v_product  public.products%rowtype;
  v_qty      integer;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select status into v_curr from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;
  if v_curr <> 'pending' then raise exception 'locked_status' using errcode = '22000'; end if;

  if length(v_name) < 2 then    raise exception 'invalid_name'    using errcode = '22000'; end if;
  if length(v_phone) < 7 then   raise exception 'invalid_phone'   using errcode = '22000'; end if;
  if length(v_address) < 5 then raise exception 'invalid_address' using errcode = '22000'; end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'empty_cart' using errcode = '22000';
  end if;

  -- Validate + compute subtotal first (atomic; nothing mutated yet beyond the lock).
  for item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := coalesce((item->>'qty')::integer, 0);
    if v_qty <= 0 then raise exception 'invalid_qty' using errcode = '22000'; end if;
    select * into v_product from public.products where id = (item->>'product_id')::uuid;
    if not found then raise exception 'product_missing' using errcode = '22000'; end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  v_total := greatest(0, v_subtotal + v_charge - v_discount);

  -- Replace items (cascade-safe — pending status means no stock movement yet).
  delete from public.order_items where order_id = p_order_id;
  for item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := (item->>'qty')::integer;
    select * into v_product from public.products where id = (item->>'product_id')::uuid;
    insert into public.order_items (
      order_id, product_id, product_name, product_price, quantity, line_total
    ) values (
      p_order_id, v_product.id, v_product.name, v_product.price,
      v_qty, v_product.price * v_qty
    );
  end loop;

  update public.orders
     set customer_name    = v_name,
         customer_phone   = v_phone,
         customer_address = v_address,
         customer_note    = v_note,
         admin_note       = v_admin,
         delivery_zone    = v_zone,
         subtotal         = v_subtotal,
         discount_amount  = v_discount,
         charge_amount    = v_charge,
         total_amount     = v_total,
         updated_at       = now()
   where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (p_order_id, v_curr, v_curr, 'Order edited', auth.uid());

  return jsonb_build_object('ok', true, 'total_amount', v_total);
end $$;
grant execute on function public.update_order_pending(uuid, jsonb) to authenticated;
