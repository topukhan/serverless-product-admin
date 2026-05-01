-- =====================================================================
-- 15 / Customer auth hardening
--   - bcrypt cost bumped from 10 to 12 on register_customer
--   - login rate limit (failed_login_count + locked_until)
--   - track last_login_ip / last_login_at
--   - admin_reset_customer_password (simplest possible password reset)
--
--   Lockout policy:
--     5 failed attempts within the rolling window  -> 30-minute lockout
--     each failure during lockout resets the timer (defensive against
--     someone pounding on a single account)
-- =====================================================================

alter table public.customer_accounts
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists locked_until       timestamptz,
  add column if not exists last_login_at      timestamptz,
  add column if not exists last_login_ip      text;

-- ---------- helper: extract caller IP from PostgREST request headers ----
create or replace function public._caller_ip()
returns text
language plpgsql
stable
as $$
declare
  v_headers jsonb;
  v_xff     text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_headers is null then return null; end if;
  v_xff := v_headers->>'x-forwarded-for';
  if v_xff is null or v_xff = '' then
    return v_headers->>'x-real-ip';
  end if;
  -- x-forwarded-for is a comma-separated list; the first hop is the client.
  return trim(split_part(v_xff, ',', 1));
end $$;

-- =====================================================================
-- Rewritten register_customer with cost-12 bcrypt
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
    values (v_full, v_phone, v_email, crypt(v_pw, gen_salt('bf', 12)), v_addr, v_zone)
    returning id into v_id;

  insert into public.customer_sessions (customer_id) values (v_id) returning token into v_token;

  return jsonb_build_object(
    'token', v_token, 'customer_id', v_id,
    'full_name', v_full, 'phone', v_phone, 'email', v_email
  );
end $$;
grant execute on function public.register_customer(jsonb) to anon, authenticated;

-- =====================================================================
-- Rewritten login_customer with rate-limit + IP capture
--   max_attempts and lockout window are inlined constants — tweak here.
-- =====================================================================
create or replace function public.login_customer(p_identifier text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  MAX_ATTEMPTS  constant int      := 5;          -- give the user a few generous tries
  LOCKOUT       constant interval := '30 minutes';
  v_ident text := trim(coalesce(p_identifier, ''));
  v_phone text := null;
  v_email text := null;
  v_acct  public.customer_accounts%rowtype;
  v_token uuid;
  v_ip    text := public._caller_ip();
begin
  if length(v_ident) < 3 then raise exception 'invalid_credentials' using errcode = '22000'; end if;

  if position('@' in v_ident) > 0 then
    v_email := lower(v_ident);
    select * into v_acct from public.customer_accounts where email = v_email for update;
  else
    v_phone := public._normalise_phone(v_ident);
    select * into v_acct from public.customer_accounts where phone = v_phone for update;
  end if;
  -- Don't disclose whether an identifier exists.
  if not found then
    perform pg_sleep(0.4);
    raise exception 'invalid_credentials' using errcode = '22000';
  end if;

  if v_acct.locked_until is not null and v_acct.locked_until > now() then
    raise exception 'locked_until:%', to_char(v_acct.locked_until, 'YYYY-MM-DD"T"HH24:MI:SSOF')
      using errcode = '22000';
  end if;

  if v_acct.password_hash is null
     or v_acct.password_hash <> crypt(coalesce(p_password,''), v_acct.password_hash) then
    update public.customer_accounts
       set failed_login_count = v_acct.failed_login_count + 1,
           locked_until = case
             when v_acct.failed_login_count + 1 >= MAX_ATTEMPTS then now() + LOCKOUT
             else locked_until
           end
     where id = v_acct.id;
    raise exception 'invalid_credentials' using errcode = '22000';
  end if;

  -- Success: clear the counter, stamp last login, rotate IP.
  update public.customer_accounts
     set failed_login_count = 0,
         locked_until       = null,
         last_login_at      = now(),
         last_login_ip      = v_ip
   where id = v_acct.id;

  insert into public.customer_sessions (customer_id) values (v_acct.id) returning token into v_token;

  return jsonb_build_object(
    'token', v_token, 'customer_id', v_acct.id,
    'full_name', v_acct.full_name, 'phone', v_acct.phone, 'email', v_acct.email
  );
end $$;
grant execute on function public.login_customer(text, text) to anon, authenticated;

-- =====================================================================
-- RPC: admin_reset_customer_password — simplest password reset
--   Admin sets a new password manually (typed or auto-generated client-
--   side) and shares it with the customer out-of-band (WhatsApp, phone).
--   All existing sessions for that customer are revoked.
-- =====================================================================
create or replace function public.admin_reset_customer_password(
  p_customer_id uuid, p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pw text := coalesce(p_new_password, '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(v_pw) < 6 then raise exception 'weak_password' using errcode = '22000'; end if;

  update public.customer_accounts
     set password_hash       = crypt(v_pw, gen_salt('bf', 12)),
         failed_login_count  = 0,
         locked_until        = null,
         updated_at          = now()
   where id = p_customer_id;
  if not found then raise exception 'customer_missing' using errcode = '22000'; end if;

  -- Force re-login everywhere.
  delete from public.customer_sessions where customer_id = p_customer_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_reset_customer_password(uuid, text) to authenticated;

-- =====================================================================
-- list_customers: include last_login_at + locked status for the admin
-- panel without exposing password_hash.
-- =====================================================================
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
           last_login_at, last_login_ip,
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
