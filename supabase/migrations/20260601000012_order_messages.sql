-- =====================================================================
-- 12 / Order chat (per-order messages between customer and admin)
--   - settings.order_message_limit : configurable total cap per order
--   - order_messages table         : sender_role, body, read timestamps
--   - RPCs                         : send_order_message,
--                                    get_order_messages_for_customer,
--                                    get_order_messages_for_admin,
--                                    mark_order_messages_read,
--                                    get_admin_unread_message_count,
--                                    get_my_unread_message_count
-- =====================================================================

alter table public.settings
  add column if not exists order_message_limit integer not null default 10
    check (order_message_limit >= 0 and order_message_limit <= 100);

create table if not exists public.order_messages (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  sender_role           text not null check (sender_role in ('customer','admin')),
  sender_id             uuid references auth.users(id) on delete set null,
  body                  text not null check (length(trim(body)) > 0 and length(body) <= 1000),
  read_by_customer_at   timestamptz,
  read_by_admin_at      timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_order_messages_order on public.order_messages (order_id, created_at);
create index if not exists idx_order_messages_unread_admin
  on public.order_messages (order_id) where sender_role = 'customer' and read_by_admin_at is null;
create index if not exists idx_order_messages_unread_customer
  on public.order_messages (order_id) where sender_role = 'admin' and read_by_customer_at is null;

alter table public.order_messages enable row level security;

do $$ declare r record; begin
  for r in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'order_messages'
  loop execute format('drop policy if exists %I on public.order_messages', r.policyname); end loop;
end $$;

-- All writes go through the RPC (security definer); table policies are read-only-for-owners.
create policy "order_messages: admin all"
  on public.order_messages for all
  using (public.is_admin()) with check (public.is_admin());

create policy "order_messages: customer read own"
  on public.order_messages for select
  using (exists (select 1 from public.orders o
                 where o.id = order_messages.order_id
                   and o.customer_id = auth.uid()));

grant select on public.order_messages to authenticated;

-- =====================================================================
-- RPC: send_order_message — enforces limit + role + ownership
-- =====================================================================
create or replace function public.send_order_message(p_order_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean := public.is_admin();
  v_role   text;
  v_body   text := trim(coalesce(p_body, ''));
  v_owner  uuid;
  v_limit  int;
  v_used   int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if length(v_body) = 0 then raise exception 'empty_body' using errcode = '22000'; end if;
  if length(v_body) > 1000 then raise exception 'body_too_long' using errcode = '22000'; end if;

  select customer_id into v_owner from public.orders where id = p_order_id;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;

  if v_admin then
    v_role := 'admin';
  elsif v_owner is not null and v_owner = v_uid then
    v_role := 'customer';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select order_message_limit into v_limit from public.settings where id = 1;
  select count(*) into v_used from public.order_messages where order_id = p_order_id;
  if v_used >= v_limit then
    raise exception 'limit_reached' using errcode = '22000';
  end if;

  insert into public.order_messages (order_id, sender_role, sender_id, body,
    read_by_admin_at, read_by_customer_at)
  values (p_order_id, v_role, v_uid, v_body,
    case when v_role = 'admin' then now() else null end,
    case when v_role = 'customer' then now() else null end);

  return jsonb_build_object(
    'ok', true,
    'limit', v_limit,
    'used', v_used + 1,
    'remaining', greatest(0, v_limit - (v_used + 1))
  );
end $$;
grant execute on function public.send_order_message(uuid, text) to authenticated;

-- =====================================================================
-- RPC: get_order_messages_for_customer
-- =====================================================================
create or replace function public.get_order_messages_for_customer(p_order_number text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_order_id uuid;
  v_limit   int;
  v_msgs    jsonb;
  v_used    int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select id into v_order_id from public.orders
    where order_number = p_order_number and customer_id = v_uid;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;

  select order_message_limit into v_limit from public.settings where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'sender_role', sender_role, 'body', body, 'created_at', created_at
  ) order by created_at), '[]'::jsonb), count(*)
    into v_msgs, v_used
    from public.order_messages where order_id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(0, v_limit - v_used),
    'messages', v_msgs
  );
end $$;
grant execute on function public.get_order_messages_for_customer(text) to authenticated;

-- =====================================================================
-- RPC: get_order_messages_for_admin
-- =====================================================================
create or replace function public.get_order_messages_for_admin(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit int;
  v_msgs  jsonb;
  v_used  int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  select order_message_limit into v_limit from public.settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'sender_role', sender_role, 'body', body, 'created_at', created_at
  ) order by created_at), '[]'::jsonb), count(*)
    into v_msgs, v_used
    from public.order_messages where order_id = p_order_id;

  return jsonb_build_object(
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(0, v_limit - v_used),
    'messages', v_msgs
  );
end $$;
grant execute on function public.get_order_messages_for_admin(uuid) to authenticated;

-- =====================================================================
-- RPC: mark_order_messages_read
--   Customer sets read_by_customer_at on admin-sent unread; vice versa.
-- =====================================================================
create or replace function public.mark_order_messages_read(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_owner uuid;
  v_count int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select customer_id into v_owner from public.orders where id = p_order_id;
  if not found then raise exception 'order_missing' using errcode = '22000'; end if;

  if v_admin then
    update public.order_messages
       set read_by_admin_at = now()
     where order_id = p_order_id
       and sender_role = 'customer'
       and read_by_admin_at is null;
    get diagnostics v_count = row_count;
  elsif v_owner is not null and v_owner = v_uid then
    update public.order_messages
       set read_by_customer_at = now()
     where order_id = p_order_id
       and sender_role = 'admin'
       and read_by_customer_at is null;
    get diagnostics v_count = row_count;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object('marked', v_count);
end $$;
grant execute on function public.mark_order_messages_read(uuid) to authenticated;

-- =====================================================================
-- RPC: get_admin_unread_message_count
-- =====================================================================
create or replace function public.get_admin_unread_message_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case when public.is_admin()
              then (select count(*)::int from public.order_messages
                    where sender_role = 'customer' and read_by_admin_at is null)
              else 0
         end;
$$;
grant execute on function public.get_admin_unread_message_count() to authenticated;

-- =====================================================================
-- RPC: get_my_unread_message_count (customer)
-- =====================================================================
create or replace function public.get_my_unread_message_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case when auth.uid() is null then 0
              else (select count(*)::int
                    from public.order_messages m
                    join public.orders o on o.id = m.order_id
                   where o.customer_id = auth.uid()
                     and m.sender_role = 'admin'
                     and m.read_by_customer_at is null)
         end;
$$;
grant execute on function public.get_my_unread_message_count() to authenticated;

-- ---------- Redefine get_my_orders to include unread admin-message count ----------
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
    'unread_count', (select count(*)::int from public.order_messages m
                     where m.order_id = o.id and m.sender_role = 'admin'
                       and m.read_by_customer_at is null)
  ) order by o.placed_at desc), '[]'::jsonb)
    from public.orders o
   where o.customer_id = auth.uid()
     and (p_status is null or o.status = p_status);
$$;
grant execute on function public.get_my_orders(text) to authenticated;
