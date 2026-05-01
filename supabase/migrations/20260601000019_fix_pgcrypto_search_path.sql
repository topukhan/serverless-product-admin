-- =====================================================================
-- 19 / Fix pgcrypto search_path
--   On managed Supabase, pgcrypto is installed in the `extensions`
--   schema. Our auth functions had `search_path = public`, so calls to
--   `gen_salt(...)` and `crypt(...)` couldn't resolve. Re-create them
--   with `search_path = public, extensions` so the operators are found.
-- =====================================================================

-- ---------- register_customer ----------
create or replace function public.register_customer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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

-- ---------- login_customer ----------
create or replace function public.login_customer(p_identifier text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  MAX_ATTEMPTS  constant int      := 5;
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

-- ---------- admin_reset_customer_password ----------
create or replace function public.admin_reset_customer_password(
  p_customer_id uuid, p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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

  delete from public.customer_sessions where customer_id = p_customer_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.admin_reset_customer_password(uuid, text) to authenticated;

-- ---------- change_customer_password ----------
create or replace function public.change_customer_password(
  p_token uuid, p_old_password text, p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid := public._resolve_customer_token(p_token);
  v_acct public.customer_accounts%rowtype;
  v_new  text := coalesce(p_new_password, '');
begin
  if v_id is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if length(v_new) < 6 then raise exception 'weak_password' using errcode = '22000'; end if;

  select * into v_acct from public.customer_accounts where id = v_id for update;
  if not found then raise exception 'customer_missing' using errcode = '22000'; end if;

  if v_acct.password_hash is null
     or v_acct.password_hash <> crypt(coalesce(p_old_password,''), v_acct.password_hash) then
    raise exception 'invalid_credentials' using errcode = '22000';
  end if;

  update public.customer_accounts
     set password_hash      = crypt(v_new, gen_salt('bf', 12)),
         failed_login_count = 0,
         locked_until       = null,
         updated_at         = now()
   where id = v_id;

  delete from public.customer_sessions
   where customer_id = v_id and token <> p_token;

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.change_customer_password(uuid, text, text) to anon, authenticated;

-- ---------- admin_create_customer ----------
create or replace function public.admin_create_customer(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
