-- =====================================================================
-- 11 / Customer accounts
--   - customer_profiles : 1:1 with auth.users (name, phone, email,
--                         address, delivery_zone)
--   - signup trigger    : creates the profile row from raw_user_meta_data
--   - orders.customer_id: nullable link to auth.users
--   - place_order       : auto-attaches auth.uid() when present
--   - RLS               : customers see/edit their own profile + orders
--   - RPCs              : get_my_orders, get_my_order_view,
--                         get_my_profile, update_my_profile,
--                         search_customers (admin), list_customers (admin)
-- =====================================================================

-- ---------- customer_profiles ----------
create table if not exists public.customer_profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  phone          text,
  email          text,
  address        text,
  delivery_zone  text check (delivery_zone is null or delivery_zone in ('inside_dhaka','outside_dhaka')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_customer_profiles_phone on public.customer_profiles (phone);
create index if not exists idx_customer_profiles_email on public.customer_profiles (email);
create index if not exists idx_customer_profiles_name  on public.customer_profiles (full_name);

alter table public.customer_profiles enable row level security;

do $$ declare r record; begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'customer_profiles'
  loop execute format('drop policy if exists %I on public.customer_profiles', r.policyname); end loop;
end $$;

create policy "customer_profiles: self read"
  on public.customer_profiles for select
  using (user_id = auth.uid() or public.is_admin());

create policy "customer_profiles: self update"
  on public.customer_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "customer_profiles: self insert"
  on public.customer_profiles for insert
  with check (user_id = auth.uid() or public.is_admin());

create policy "customer_profiles: admin write"
  on public.customer_profiles for all
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.customer_profiles to authenticated;

-- ---------- Signup trigger: seed profile from user metadata ----------
create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.customer_profiles (
    user_id, full_name, phone, email, address, delivery_zone
  ) values (
    new.id,
    nullif(trim(coalesce(meta->>'full_name','')), ''),
    nullif(trim(coalesce(meta->>'phone','')), ''),
    nullif(trim(coalesce(meta->>'email', new.email)), ''),
    nullif(trim(coalesce(meta->>'address','')), ''),
    nullif(lower(coalesce(meta->>'delivery_zone','')), '')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_customer();

-- ---------- Link orders to a customer (optional) ----------
alter table public.orders
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

create index if not exists idx_orders_customer_id on public.orders (customer_id);

-- Customers can read their own orders / items / events.
do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('orders','order_items','order_events')
             and policyname in ('orders: customer read',
                                'order_items: customer read',
                                'order_events: customer read')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "orders: customer read"
  on public.orders for select
  using (customer_id is not null and customer_id = auth.uid());

create policy "order_items: customer read"
  on public.order_items for select
  using (exists (select 1 from public.orders o
                 where o.id = order_items.order_id
                   and o.customer_id = auth.uid()));

create policy "order_events: customer read"
  on public.order_events for select
  using (exists (select 1 from public.orders o
                 where o.id = order_events.order_id
                   and o.customer_id = auth.uid()));

-- ---------- place_order: auto-attach auth.uid() ----------
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
  v_uid        uuid := auth.uid();
  item         jsonb;
  v_product    public.products%rowtype;
  v_qty        integer;
  v_line       numeric(12,2);
begin
  if length(v_name) < 2 then    raise exception 'invalid_name'    using errcode = '22000'; end if;
  if length(v_phone) < 7 then   raise exception 'invalid_phone'   using errcode = '22000'; end if;
  if length(v_address) < 5 then raise exception 'invalid_address' using errcode = '22000'; end if;
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
    if v_qty <= 0 then raise exception 'invalid_qty' using errcode = '22000'; end if;
    select * into v_product from public.products
      where id = (item->>'product_id')::uuid for update;
    if not found then raise exception 'product_missing' using errcode = '22000'; end if;
    if v_product.stock < v_qty then
      raise exception 'insufficient_stock:%', v_product.name using errcode = '22000';
    end if;
    v_line := v_product.price * v_qty;
    v_subtotal := v_subtotal + v_line;
  end loop;

  v_total := v_subtotal + coalesce(v_charge, 0);

  insert into public.orders (
    id, order_number, status, customer_id, customer_name, customer_phone, customer_address,
    customer_note, delivery_zone, subtotal, discount_amount, charge_amount, total_amount
  ) values (
    v_order_id, v_number, 'pending', v_uid, v_name, v_phone, v_address,
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

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (v_order_id, null, 'pending', 'Order placed', v_uid);

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

-- ---------- RPC: get_my_profile ----------
create or replace function public.get_my_profile()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select case when auth.uid() is null then null
              else jsonb_build_object(
                'user_id', cp.user_id,
                'full_name', cp.full_name,
                'phone', cp.phone,
                'email', cp.email,
                'address', cp.address,
                'delivery_zone', cp.delivery_zone,
                'auth_email', u.email,
                'created_at', cp.created_at
              )
         end
    from auth.users u
    left join public.customer_profiles cp on cp.user_id = u.id
   where u.id = auth.uid();
$$;
grant execute on function public.get_my_profile() to authenticated;

-- ---------- RPC: update_my_profile ----------
create or replace function public.update_my_profile(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name  text := nullif(trim(coalesce(payload->>'full_name','')), '');
  v_addr  text := nullif(trim(coalesce(payload->>'address','')), '');
  v_zone  text := nullif(lower(coalesce(payload->>'delivery_zone','')), '');
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;

  insert into public.customer_profiles (user_id, full_name, address, delivery_zone)
    values (v_uid, v_name, v_addr, v_zone)
  on conflict (user_id) do update
    set full_name     = excluded.full_name,
        address       = excluded.address,
        delivery_zone = excluded.delivery_zone,
        updated_at    = now();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- ---------- RPC: get_my_orders (basic; redefined in 12 to include unread count) ----------
create or replace function public.get_my_orders(p_status text default null)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'total_amount', o.total_amount,
    'placed_at', o.placed_at,
    'item_count', (select coalesce(sum(quantity),0)::int
                   from public.order_items where order_id = o.id),
    'unread_count', 0
  ) order by o.placed_at desc), '[]'::jsonb)
    from public.orders o
   where o.customer_id = auth.uid()
     and (p_status is null or o.status = p_status);
$$;
grant execute on function public.get_my_orders(text) to authenticated;

-- ---------- RPC: get_my_order_view ----------
create or replace function public.get_my_order_view(p_order_number text)
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
  select * into v_order from public.orders
   where order_number = p_order_number and customer_id = auth.uid();
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
grant execute on function public.get_my_order_view(text) to authenticated;

-- ---------- RPC: search_customers (admin, used in order picker) ----------
create or replace function public.search_customers(p_term text, p_limit int default 12)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_term text := trim(coalesce(p_term, ''));
  v_pat  text := '%' || v_term || '%';
  v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) into v_rows from (
    select cp.user_id as id, cp.full_name, cp.phone, cp.email, cp.address, cp.delivery_zone
      from public.customer_profiles cp
     where v_term = ''
        or cp.full_name ilike v_pat
        or cp.phone     ilike v_pat
        or cp.email     ilike v_pat
     order by cp.created_at desc
     limit greatest(1, least(p_limit, 50))
  ) r;
  return v_rows;
end $$;
grant execute on function public.search_customers(text, int) to authenticated;

-- ---------- RPC: list_customers (admin customer list page) ----------
create or replace function public.list_customers(p_term text default null,
                                                  p_limit int default 30,
                                                  p_offset int default 0)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_term text := trim(coalesce(p_term, ''));
  v_pat  text := '%' || v_term || '%';
  v_rows jsonb;
  v_total int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select count(*) into v_total
    from public.customer_profiles cp
   where v_term = ''
      or cp.full_name ilike v_pat
      or cp.phone     ilike v_pat
      or cp.email     ilike v_pat;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) into v_rows from (
    select cp.user_id as id, cp.full_name, cp.phone, cp.email, cp.address,
           cp.delivery_zone, cp.created_at,
           (select count(*)::int from public.orders o where o.customer_id = cp.user_id) as order_count
      from public.customer_profiles cp
     where v_term = ''
        or cp.full_name ilike v_pat
        or cp.phone     ilike v_pat
        or cp.email     ilike v_pat
     order by cp.created_at desc
     limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
  ) r;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;
grant execute on function public.list_customers(text, int, int) to authenticated;

-- ---------- Patch create_admin_order: accept payload.customer_id ----------
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
  v_cust_id  uuid := nullif(payload->>'customer_id','')::uuid;
  v_items    jsonb := payload->'items';
  v_order_id uuid := gen_random_uuid();
  v_number   text := next_order_number();
  item       jsonb;
  v_product  public.products%rowtype;
  v_qty      integer;
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
    id, order_number, status, source, customer_id,
    customer_name, customer_phone, customer_address, customer_note,
    admin_note, delivery_zone,
    subtotal, discount_amount, charge_amount, total_amount,
    viewed_at
  ) values (
    v_order_id, v_number, 'pending', 'admin', v_cust_id,
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

-- ---------- Patch update_order_pending: customer_id ----------
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
  v_cust_id  uuid := nullif(payload->>'customer_id','')::uuid;
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

  for item in select * from jsonb_array_elements(v_items)
  loop
    v_qty := coalesce((item->>'qty')::integer, 0);
    if v_qty <= 0 then raise exception 'invalid_qty' using errcode = '22000'; end if;
    select * into v_product from public.products where id = (item->>'product_id')::uuid;
    if not found then raise exception 'product_missing' using errcode = '22000'; end if;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  end loop;

  v_total := greatest(0, v_subtotal + v_charge - v_discount);

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
     set customer_id      = v_cust_id,
         customer_name    = v_name,
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
