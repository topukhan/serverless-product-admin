-- =====================================================================
-- 13 / Phone-signup domain + route loader flag + editable profile phone
--   - settings.customer_phone_email_domain : domain used for synthetic
--     phone-only signups. Supabase auth rejects reserved TLDs (.local,
--     .test, .invalid). Default 'phone-customer.app' uses a real TLD.
--   - flags.show_route_loader : when true, show a global top-of-page
--     loader during route transitions.
--   - update_my_profile : accept phone field too.
-- =====================================================================

alter table public.settings
  add column if not exists customer_phone_email_domain text not null default 'phone-customer.app';

-- Seed the new flag without disturbing existing flags.
update public.settings
   set flags = coalesce(flags, '{}'::jsonb) || '{"show_route_loader": true}'::jsonb
 where id = 1
   and not (flags ? 'show_route_loader');

-- Patched update_my_profile: now accepts phone too.
create or replace function public.update_my_profile(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := nullif(trim(coalesce(payload->>'full_name','')), '');
  v_phone text := nullif(regexp_replace(coalesce(payload->>'phone',''), '\D', '', 'g'), '');
  v_addr  text := nullif(trim(coalesce(payload->>'address','')), '');
  v_zone  text := nullif(lower(coalesce(payload->>'delivery_zone','')), '');
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_zone is not null and v_zone not in ('inside_dhaka','outside_dhaka') then
    raise exception 'invalid_zone' using errcode = '22000';
  end if;

  insert into public.customer_profiles (user_id, full_name, phone, address, delivery_zone)
    values (v_uid, v_name, v_phone, v_addr, v_zone)
  on conflict (user_id) do update
    set full_name     = excluded.full_name,
        phone         = coalesce(excluded.phone, public.customer_profiles.phone),
        address       = excluded.address,
        delivery_zone = excluded.delivery_zone,
        updated_at    = now();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.update_my_profile(jsonb) to authenticated;
