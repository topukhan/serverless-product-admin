-- =====================================================================
-- 16 / Customer self-service password change
--   After an admin reset, the customer signs in with the temp password
--   and changes it from their profile page. This RPC requires the old
--   password too, so a stolen session token alone can't be used to lock
--   the real owner out of their account.
-- =====================================================================

create or replace function public.change_customer_password(
  p_token uuid, p_old_password text, p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  -- Invalidate every other session; keep the one the user is on right now
  -- so they aren't immediately bounced to /login mid-flow.
  delete from public.customer_sessions
   where customer_id = v_id and token <> p_token;

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.change_customer_password(uuid, text, text) to anon, authenticated;
