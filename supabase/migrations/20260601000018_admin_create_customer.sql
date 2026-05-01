-- =====================================================================
-- 18 / Admin-created customers
--   - customer_accounts.source : 'self' (registered themselves)
--                                'admin' (created by an admin)
--   - password_hash made nullable so admin can create a customer record
--     without setting a password yet. Login still rejects null hashes
--     (mapped to invalid_credentials), so admins use Reset password to
--     hand out credentials when the customer needs to sign in.
--   - admin_create_customer(payload) RPC.
-- =====================================================================

alter table public.customer_accounts
  add column if not exists source text not null default 'self'
    check (source in ('self','admin'));

alter table public.customer_accounts
  alter column password_hash drop not null;

create or replace function public.admin_create_customer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := nullif(trim(coalesce(payload->>'full_name','')), '');
  v_phone  text := public._normalise_phone(payload->>'phone');
  v_email  text := nullif(lower(trim(coalesce(payload->>'email',''))), '');
  v_addr   text := nullif(trim(coalesce(payload->>'address','')), '');
  v_zone   text := nullif(lower(coalesce(payload->>'delivery_zone','')), '');
  v_pw     text := coalesce(payload->>'password', '');
  v_hash   text := null;
  v_id     uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  if v_phone is null and v_email is null then
    raise exception 'identifier_required' using errcode = '22000';
  end if;
  if v_phone is not null and length(v_phone) < 7 then
    raise exception 'invalid_phone' using errcode = '22000';
  end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;
  if v_phone is not null and exists (select 1 from public.customer_accounts where phone = v_phone) then
    raise exception 'phone_taken' using errcode = '22000';
  end if;
  if v_email is not null and exists (select 1 from public.customer_accounts where email = v_email) then
    raise exception 'email_taken' using errcode = '22000';
  end if;

  if length(v_pw) > 0 then
    if length(v_pw) < 6 then raise exception 'weak_password' using errcode = '22000'; end if;
    v_hash := crypt(v_pw, gen_salt('bf', 12));
  end if;

  insert into public.customer_accounts (
    full_name, phone, email, password_hash, address, delivery_zone, source
  ) values (
    v_name, v_phone, v_email, v_hash, v_addr, v_zone, 'admin'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'customer_id', v_id,
    'has_password', v_hash is not null
  );
end $$;
grant execute on function public.admin_create_customer(jsonb) to authenticated;

-- ---------- list_customers: include `source` ----------
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
           last_login_at, last_login_ip, source,
           (password_hash is null) as needs_password,
           (locked_until is not null and locked_until > now()) as is_locked,
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

-- ---------- search_customers: include source for admin order picker ----------
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
    select id, full_name, phone, email, address, delivery_zone, source
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
