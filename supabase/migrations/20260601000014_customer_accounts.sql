-- =====================================================================
-- 14 / Self-managed customer accounts (no Supabase Auth)
--   Customers register and log in with phone OR email + password. We
--   store a bcrypt password hash ourselves and issue an opaque session
--   token that the frontend keeps in localStorage. Every customer-side
--   RPC takes that token, resolves it to a customer id, and runs as
--   security definer. Admin auth stays on Supabase Auth and is_admin().
--
--   Tables
--     - customer_accounts (id, full_name, phone, email, password_hash,
--                          address, delivery_zone, …)
--     - customer_sessions (token uuid pk, customer_id, expires_at)
--
--   RPCs (anon-callable; security definer)
--     - register_customer(payload)            -> { token, customer_id, full_name }
--     - login_customer(identifier, password)  -> { token, customer_id, full_name }
--     - logout_customer(token)
--     - get_customer_by_token(token)          -> profile json
--     - update_customer_profile(token, json)
--     - place_order(payload)  (patched: reads payload.customer_token)
--     - get_my_orders(p_token, p_status)
--     - get_my_order_view(p_token, p_order_number)
--     - get_my_unread_message_count(p_token)
--     - customer_send_order_message(p_token, p_order_id, p_body)
--     - customer_get_order_messages(p_token, p_order_number)
--     - customer_mark_order_messages_read(p_token, p_order_id)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Drop the previous Supabase-Auth-based customer pieces ----------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_customer();
drop function if exists public.get_my_profile();
drop function if exists public.update_my_profile(jsonb);
drop function if exists public.get_my_orders(text);
drop function if exists public.get_my_order_view(text);
drop function if exists public.get_my_unread_message_count();
drop function if exists public.search_customers(text, int);
drop function if exists public.list_customers(text, int, int);
drop function if exists public.get_order_messages_for_customer(text);
drop function if exists public.send_order_message(uuid, text);
drop function if exists public.mark_order_messages_read(uuid);

do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and policyname in ('orders: customer read',
                                'order_items: customer read',
                                'order_events: customer read',
                                'order_messages: customer read own',
                                'customer_profiles: self read',
                                'customer_profiles: self update',
                                'customer_profiles: self insert',
                                'customer_profiles: admin write')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- orders.customer_id used to ref auth.users; remove that FK so the new
-- customer_accounts table can take over as the referent.
alter table public.orders drop constraint if exists orders_customer_id_fkey;

drop table if exists public.customer_profiles;

-- ---------- New tables ----------
create table if not exists public.customer_accounts (
  id             uuid primary key default gen_random_uuid(),
  full_name      text,
  phone          text unique,
  email          text unique,
  password_hash  text not null,
  address        text,
  delivery_zone  text check (delivery_zone is null or delivery_zone in ('inside_dhaka','outside_dhaka')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint customer_identifier_required check (phone is not null or email is not null)
);
create index if not exists idx_customer_accounts_phone on public.customer_accounts (phone);
create index if not exists idx_customer_accounts_email on public.customer_accounts (email);
create index if not exists idx_customer_accounts_name  on public.customer_accounts (full_name);

create table if not exists public.customer_sessions (
  token        uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customer_accounts(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '180 days'
);
create index if not exists idx_customer_sessions_customer on public.customer_sessions (customer_id);

-- Existing orders may have a customer_id that pointed to auth.users (from
-- the previous migration). Those UUIDs won't exist in the new
-- customer_accounts table, so clear them before adding the new FK. The
-- order rows themselves are preserved — just unlinked from any account.
update public.orders
   set customer_id = null
 where customer_id is not null
   and customer_id not in (select id from public.customer_accounts);

-- Re-link orders.customer_id to the new accounts table (soft-link so
-- deleting a customer doesn't blow away their order history).
alter table public.orders drop constraint if exists orders_customer_id_fkey;
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customer_accounts(id) on delete set null;

-- ---------- RLS: lock everything; RPCs are the only entrypoints ----------
alter table public.customer_accounts enable row level security;
alter table public.customer_sessions enable row level security;

do $$ declare r record; begin
  for r in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('customer_accounts','customer_sessions')
  loop execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

create policy "customer_accounts: admin read"
  on public.customer_accounts for select using (public.is_admin());
create policy "customer_accounts: admin write"
  on public.customer_accounts for all
  using (public.is_admin()) with check (public.is_admin());

create policy "customer_sessions: admin all"
  on public.customer_sessions for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Helpers
-- =====================================================================

-- Resolve a token to its customer_id, expiring stale sessions on the way.
-- Returns null if the token is missing/invalid/expired.
create or replace function public._resolve_customer_token(p_token uuid)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare v_id uuid;
begin
  if p_token is null then return null; end if;
  select customer_id into v_id
    from public.customer_sessions
   where token = p_token and expires_at > now();
  return v_id;
end $$;

-- Phone normaliser: keep digits only.
create or replace function public._normalise_phone(p text)
returns text language sql immutable as $$
  select case when p is null then null
              else nullif(regexp_replace(p, '\D', '', 'g'), '') end;
$$;

-- =====================================================================
-- RPC: register_customer
-- =====================================================================
create or replace function public.register_customer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full   text := nullif(trim(coalesce(payload->>'full_name','')), '');
  v_ident  text := trim(coalesce(payload->>'identifier',''));
  v_pw     text := coalesce(payload->>'password','');
  v_addr   text := nullif(trim(coalesce(payload->>'address','')), '');
  v_zone   text := nullif(lower(coalesce(payload->>'delivery_zone','')), '');
  v_phone  text := null;
  v_email  text := null;
  v_id     uuid;
  v_token  uuid;
begin
  if length(v_ident) < 3 then raise exception 'invalid_identifier' using errcode = '22000'; end if;
  if length(v_pw)    < 6 then raise exception 'weak_password'      using errcode = '22000'; end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;

  if position('@' in v_ident) > 0 then
    v_email := lower(v_ident);
  else
    v_phone := public._normalise_phone(v_ident);
    if v_phone is null or length(v_phone) < 7 then
      raise exception 'invalid_phone' using errcode = '22000';
    end if;
  end if;

  if v_phone is not null and exists (select 1 from public.customer_accounts where phone = v_phone) then
    raise exception 'phone_taken' using errcode = '22000';
  end if;
  if v_email is not null and exists (select 1 from public.customer_accounts where email = v_email) then
    raise exception 'email_taken' using errcode = '22000';
  end if;

  insert into public.customer_accounts (full_name, phone, email, password_hash, address, delivery_zone)
    values (v_full, v_phone, v_email, crypt(v_pw, gen_salt('bf', 10)), v_addr, v_zone)
    returning id into v_id;

  insert into public.customer_sessions (customer_id) values (v_id) returning token into v_token;

  return jsonb_build_object(
    'token', v_token,
    'customer_id', v_id,
    'full_name', v_full,
    'phone', v_phone,
    'email', v_email
  );
end $$;
grant execute on function public.register_customer(jsonb) to anon, authenticated;

-- =====================================================================
-- RPC: login_customer
-- =====================================================================
create or replace function public.login_customer(p_identifier text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ident text := trim(coalesce(p_identifier, ''));
  v_phone text := null;
  v_email text := null;
  v_acct  public.customer_accounts%rowtype;
  v_token uuid;
begin
  if length(v_ident) < 3 then raise exception 'invalid_credentials' using errcode = '22000'; end if;
  if position('@' in v_ident) > 0 then
    v_email := lower(v_ident);
    select * into v_acct from public.customer_accounts where email = v_email;
  else
    v_phone := public._normalise_phone(v_ident);
    select * into v_acct from public.customer_accounts where phone = v_phone;
  end if;

  if not found then raise exception 'invalid_credentials' using errcode = '22000'; end if;
  if v_acct.password_hash is null
     or v_acct.password_hash <> crypt(coalesce(p_password,''), v_acct.password_hash) then
    raise exception 'invalid_credentials' using errcode = '22000';
  end if;

  insert into public.customer_sessions (customer_id) values (v_acct.id) returning token into v_token;

  return jsonb_build_object(
    'token', v_token,
    'customer_id', v_acct.id,
    'full_name', v_acct.full_name,
    'phone', v_acct.phone,
    'email', v_acct.email
  );
end $$;
grant execute on function public.login_customer(text, text) to anon, authenticated;

-- =====================================================================
-- RPC: logout_customer
-- =====================================================================
create or replace function public.logout_customer(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.customer_sessions where token = p_token;
$$;
grant execute on function public.logout_customer(uuid) to anon, authenticated;

-- =====================================================================
-- RPC: get_customer_by_token
-- =====================================================================
create or replace function public.get_customer_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_id uuid := public._resolve_customer_token(p_token);
  v_acct public.customer_accounts%rowtype;
begin
  if v_id is null then return null; end if;
  select * into v_acct from public.customer_accounts where id = v_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'customer_id', v_acct.id,
    'full_name', v_acct.full_name,
    'phone', v_acct.phone,
    'email', v_acct.email,
    'address', v_acct.address,
    'delivery_zone', v_acct.delivery_zone,
    'created_at', v_acct.created_at
  );
end $$;
grant execute on function public.get_customer_by_token(uuid) to anon, authenticated;

-- =====================================================================
-- RPC: update_customer_profile
-- =====================================================================
create or replace function public.update_customer_profile(p_token uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := public._resolve_customer_token(p_token);
  v_full  text := nullif(trim(coalesce(payload->>'full_name','')), '');
  v_phone text := public._normalise_phone(payload->>'phone');
  v_addr  text := nullif(trim(coalesce(payload->>'address','')), '');
  v_zone  text := nullif(lower(coalesce(payload->>'delivery_zone','')), '');
begin
  if v_id is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;
  if v_phone is not null and exists
     (select 1 from public.customer_accounts where phone = v_phone and id <> v_id) then
    raise exception 'phone_taken' using errcode = '22000';
  end if;

  update public.customer_accounts
     set full_name     = v_full,
         phone         = coalesce(v_phone, phone),
         address       = v_addr,
         delivery_zone = v_zone,
         updated_at    = now()
   where id = v_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.update_customer_profile(uuid, jsonb) to anon, authenticated;

-- =====================================================================
-- Admin lookups, rewritten against customer_accounts
-- =====================================================================
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
    select id, full_name, phone, email, address, delivery_zone
      from public.customer_accounts
     where v_term = ''
        or full_name ilike v_pat
        or phone     ilike v_pat
        or email     ilike v_pat
     order by created_at desc
     limit greatest(1, least(p_limit, 50))
  ) r;
  return v_rows;
end $$;
grant execute on function public.search_customers(text, int) to authenticated;

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
    from public.customer_accounts
   where v_term = ''
      or full_name ilike v_pat
      or phone     ilike v_pat
      or email     ilike v_pat;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb) into v_rows from (
    select id, full_name, phone, email, address, delivery_zone, created_at,
           (select count(*)::int from public.orders o where o.customer_id = c.id) as order_count
      from public.customer_accounts c
     where v_term = ''
        or full_name ilike v_pat
        or phone     ilike v_pat
        or email     ilike v_pat
     order by created_at desc
     limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
  ) r;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;
grant execute on function public.list_customers(text, int, int) to authenticated;

-- =====================================================================
-- place_order: accept payload.customer_token (optional, for guests too)
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
  v_token      uuid  := nullif(payload->>'customer_token','')::uuid;
  v_order_id   uuid := gen_random_uuid();
  v_number     text := next_order_number();
  v_cust_id    uuid := public._resolve_customer_token(v_token);
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
    v_order_id, v_number, 'pending', v_cust_id, v_name, v_phone, v_address,
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
-- RPC: get_my_orders (token-based)
-- =====================================================================
create or replace function public.get_my_orders(p_token uuid, p_status text default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_id uuid := public._resolve_customer_token(p_token);
begin
  if v_id is null then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total_amount', o.total_amount,
      'placed_at', o.placed_at,
      'item_count', (select coalesce(sum(quantity),0)::int
                     from public.order_items where order_id = o.id),
      'unread_count', (select count(*)::int from public.order_messages m
                       where m.order_id = o.id and m.sender_role = 'admin'
                         and m.read_by_customer_at is null)
    ) order by o.placed_at desc), '[]'::jsonb)
      from public.orders o
     where o.customer_id = v_id
       and (p_status is null or o.status = p_status)
  );
end $$;
grant execute on function public.get_my_orders(uuid, text) to anon, authenticated;

-- =====================================================================
-- RPC: get_my_order_view (token-based)
-- =====================================================================
create or replace function public.get_my_order_view(p_token uuid, p_order_number text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_id    uuid := public._resolve_customer_token(p_token);
  v_order public.orders%rowtype;
  v_items jsonb;
  v_events jsonb;
begin
  if v_id is null then return null; end if;
  select * into v_order from public.orders
   where order_number = p_order_number and customer_id = v_id;
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
grant execute on function public.get_my_order_view(uuid, text) to anon, authenticated;

-- =====================================================================
-- RPC: customer_send_order_message
-- =====================================================================
create or replace function public.customer_send_order_message(p_token uuid, p_order_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := public._resolve_customer_token(p_token);
  v_owner uuid;
  v_body  text := trim(coalesce(p_body, ''));
  v_limit int;
  v_used  int;
begin
  if v_id is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if length(v_body) = 0 then raise exception 'empty_body' using errcode = '22000'; end if;
  if length(v_body) > 1000 then raise exception 'body_too_long' using errcode = '22000'; end if;

  select customer_id into v_owner from public.orders where id = p_order_id;
  if not found or v_owner is distinct from v_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select order_message_limit into v_limit from public.settings where id = 1;
  select count(*) into v_used from public.order_messages where order_id = p_order_id;
  if v_used >= v_limit then
    raise exception 'limit_reached' using errcode = '22000';
  end if;

  insert into public.order_messages (order_id, sender_role, sender_id, body, read_by_customer_at)
    values (p_order_id, 'customer', null, v_body, now());

  return jsonb_build_object('ok', true, 'limit', v_limit, 'used', v_used + 1,
                            'remaining', greatest(0, v_limit - (v_used + 1)));
end $$;
grant execute on function public.customer_send_order_message(uuid, uuid, text) to anon, authenticated;

-- =====================================================================
-- RPC: customer_get_order_messages
-- =====================================================================
create or replace function public.customer_get_order_messages(p_token uuid, p_order_number text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_id      uuid := public._resolve_customer_token(p_token);
  v_order_id uuid;
  v_limit   int;
  v_msgs    jsonb;
  v_used    int;
begin
  if v_id is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select id into v_order_id from public.orders
    where order_number = p_order_number and customer_id = v_id;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;

  select order_message_limit into v_limit from public.settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'sender_role', sender_role, 'body', body, 'created_at', created_at
  ) order by created_at), '[]'::jsonb), count(*)
    into v_msgs, v_used
    from public.order_messages where order_id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'limit', v_limit, 'used', v_used,
    'remaining', greatest(0, v_limit - v_used),
    'messages', v_msgs
  );
end $$;
grant execute on function public.customer_get_order_messages(uuid, text) to anon, authenticated;

-- =====================================================================
-- RPC: customer_mark_order_messages_read
-- =====================================================================
create or replace function public.customer_mark_order_messages_read(p_token uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid := public._resolve_customer_token(p_token);
  v_owner uuid;
  v_count int;
begin
  if v_id is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select customer_id into v_owner from public.orders where id = p_order_id;
  if not found or v_owner is distinct from v_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.order_messages
     set read_by_customer_at = now()
   where order_id = p_order_id
     and sender_role = 'admin'
     and read_by_customer_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('marked', v_count);
end $$;
grant execute on function public.customer_mark_order_messages_read(uuid, uuid) to anon, authenticated;

-- =====================================================================
-- RPC: get_my_unread_message_count (token-based)
-- =====================================================================
create or replace function public.get_my_unread_message_count(p_token uuid)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare v_id uuid := public._resolve_customer_token(p_token);
begin
  if v_id is null then return 0; end if;
  return (
    select count(*)::int
      from public.order_messages m
      join public.orders o on o.id = m.order_id
     where o.customer_id = v_id
       and m.sender_role = 'admin'
       and m.read_by_customer_at is null
  );
end $$;
grant execute on function public.get_my_unread_message_count(uuid) to anon, authenticated;

-- =====================================================================
-- RPC: admin_send_order_message + admin_mark_order_messages_read
--   Admin-only equivalents (replace the old send_order_message that
--   handled both roles). Existing get_admin_unread_message_count and
--   get_order_messages_for_admin from migration 12 still work as-is.
-- =====================================================================
create or replace function public.admin_send_order_message(p_order_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body  text := trim(coalesce(p_body, ''));
  v_limit int;
  v_used  int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_body) = 0 then raise exception 'empty_body' using errcode = '22000'; end if;
  if length(v_body) > 1000 then raise exception 'body_too_long' using errcode = '22000'; end if;

  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'order_missing' using errcode = '22000';
  end if;

  select order_message_limit into v_limit from public.settings where id = 1;
  select count(*) into v_used from public.order_messages where order_id = p_order_id;
  if v_used >= v_limit then raise exception 'limit_reached' using errcode = '22000'; end if;

  insert into public.order_messages (order_id, sender_role, sender_id, body, read_by_admin_at)
    values (p_order_id, 'admin', auth.uid(), v_body, now());
  return jsonb_build_object('ok', true, 'limit', v_limit, 'used', v_used + 1,
                            'remaining', greatest(0, v_limit - (v_used + 1)));
end $$;
grant execute on function public.admin_send_order_message(uuid, text) to authenticated;

create or replace function public.admin_mark_order_messages_read(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.order_messages
     set read_by_admin_at = now()
   where order_id = p_order_id
     and sender_role = 'customer'
     and read_by_admin_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('marked', v_count);
end $$;
grant execute on function public.admin_mark_order_messages_read(uuid) to authenticated;
