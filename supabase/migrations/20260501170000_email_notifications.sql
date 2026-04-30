-- =====================================================================
-- Migration: Email notifications via Resend
-- Adds an email channel alongside Telegram. Both fan out from a single
-- notify_admins() helper so trigger code stays small. Free 100 emails/day
-- on Resend's free tier.
-- Run AFTER 20260501150000_telegram_notifications.sql. Idempotent.
-- =====================================================================

-- ---------- Config columns ----------
alter table public.notification_config
  add column if not exists email_enabled boolean not null default false,
  add column if not exists email_api_key text,
  add column if not exists email_from    text default 'onboarding@resend.dev',
  add column if not exists email_to      text;

-- =====================================================================
-- send_email — fire-and-forget POST to Resend.
-- Failures swallowed (NOTICE only) so a misconfigured channel can't
-- break an order INSERT.
-- =====================================================================
create or replace function public.send_email(p_subject text, p_text text)
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_from text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.email_enabled, false) then
    return;
  end if;
  if v_cfg.email_api_key is null
     or length(trim(coalesce(v_cfg.email_api_key,''))) = 0
     or v_cfg.email_to is null
     or length(trim(coalesce(v_cfg.email_to,''))) = 0 then
    return;
  end if;

  v_from := coalesce(nullif(trim(v_cfg.email_from), ''), 'onboarding@resend.dev');

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    body    := jsonb_build_object(
                 'from', v_from,
                 'to', jsonb_build_array(v_cfg.email_to),
                 'subject', p_subject,
                 'text', p_text
               ),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_cfg.email_api_key
               )
  );
exception when others then
  raise notice 'send_email failed: %', sqlerrm;
end $$;

grant execute on function public.send_email(text, text) to authenticated;

-- =====================================================================
-- notify_admins(subject, body) — fan out to every enabled channel.
-- Telegram receives a bold-headed HTML message; email receives the
-- subject + plain body. Used by all three table triggers.
-- =====================================================================
create or replace function public.notify_admins(p_subject text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_telegram('<b>' || p_subject || '</b>' || E'\n\n' || p_body);
  perform public.send_email(p_subject, p_body);
exception when others then
  raise notice 'notify_admins failed: %', sqlerrm;
end $$;

grant execute on function public.notify_admins(text, text) to authenticated;

-- =====================================================================
-- Update test RPCs: one per channel so admin can isolate failures.
-- =====================================================================
create or replace function public.send_test_telegram()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.send_telegram(
    '✅ <b>Test from your store</b>' || E'\n' ||
    'Telegram alerts are wired up correctly.'
  );
end $$;
grant execute on function public.send_test_telegram() to authenticated;

create or replace function public.send_test_email()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.send_email(
    'Test notification from your store',
    'If you can read this, email alerts are wired up correctly.'
  );
end $$;
grant execute on function public.send_test_email() to authenticated;

-- Keep the old combined RPC working — fires both channels.
create or replace function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.send_telegram('✅ Test notification (combined).');
  perform public.send_email('Test notification', 'Combined test.');
end $$;
grant execute on function public.send_test_notification() to authenticated;

-- =====================================================================
-- Trigger functions: re-route through notify_admins so both channels fire.
-- =====================================================================
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_subject text;
  v_body text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_order, false) then
    return new;
  end if;
  v_subject := '🛒 New order ' || coalesce(new.order_number, '?');
  v_body :=
    'Order: '    || coalesce(new.order_number, '?')   || E'\n' ||
    'Customer: ' || coalesce(new.customer_name, '?')  || E'\n' ||
    'Phone: '    || coalesce(new.customer_phone, '?') || E'\n' ||
    'Total: ৳'   || coalesce(new.total_amount::text, '0');
  perform public.notify_admins(v_subject, v_body);
  return new;
exception when others then
  raise notice 'notify_new_order failed: %', sqlerrm;
  return new;
end $$;

create or replace function public.notify_new_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_pname text;
  v_subject text;
  v_body text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_question, false) then
    return new;
  end if;
  select name into v_pname from public.products where id = new.product_id;
  v_subject := '❓ New question on ' || coalesce(v_pname, 'a product');
  v_body :=
    'Product: ' || coalesce(v_pname, '(unknown)') || E'\n' ||
    'Q: '       || coalesce(new.question, '');
  perform public.notify_admins(v_subject, v_body);
  return new;
exception when others then
  raise notice 'notify_new_question failed: %', sqlerrm;
  return new;
end $$;

create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_pname text;
  v_subject text;
  v_body text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_review, false) then
    return new;
  end if;
  select name into v_pname from public.products where id = new.product_id;
  v_subject := '⭐ New review (' || new.rating || '/5) on ' || coalesce(v_pname, 'a product');
  v_body :=
    'Product: ' || coalesce(v_pname, '(unknown)') || E'\n' ||
    'By: '      || coalesce(new.user_name, '?')   ||
    case when new.comment is not null and length(new.comment) > 0
         then E'\n\n' || left(new.comment, 800) else '' end;
  perform public.notify_admins(v_subject, v_body);
  return new;
exception when others then
  raise notice 'notify_new_review failed: %', sqlerrm;
  return new;
end $$;
