-- =====================================================================
-- Migration: Telegram notifications
-- Sends a Telegram message to the admin's chat whenever a new order /
-- question / review is inserted. Uses pg_net so triggers don't block.
-- All channel config lives in notification_config (admin-only).
-- Run AFTER prior migrations. Idempotent.
-- =====================================================================

-- ---------- pg_net (HTTP from inside the DB) ----------
create extension if not exists pg_net;

-- ---------- Config singleton ----------
create table if not exists public.notification_config (
  id                  integer primary key default 1,
  enabled             boolean not null default false,
  telegram_bot_token  text,
  telegram_chat_id    text,
  notify_on_order     boolean not null default true,
  notify_on_question  boolean not null default true,
  notify_on_review    boolean not null default true,
  updated_at          timestamptz not null default now(),
  constraint notification_config_singleton check (id = 1)
);

insert into public.notification_config (id) values (1)
on conflict (id) do nothing;

-- ---------- RLS: admin only (token must not leak to anon) ----------
alter table public.notification_config enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'notification_config'
  loop
    execute format('drop policy if exists %I on public.notification_config', r.policyname);
  end loop;
end $$;

create policy "notification_config: admin only"
  on public.notification_config for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Helper: send_telegram(text) — fire-and-forget HTTPS to Telegram.
-- Failure is logged via NOTICE, never raised — a misconfigured channel
-- must NOT block an order insert.
-- =====================================================================
create or replace function public.send_telegram(p_text text)
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_token   text;
  v_chat    text;
  v_enabled boolean;
begin
  select telegram_bot_token, telegram_chat_id, enabled
    into v_token, v_chat, v_enabled
    from public.notification_config where id = 1;

  if not v_enabled or v_token is null or v_chat is null
     or length(trim(v_token)) = 0 or length(trim(v_chat)) = 0 then
    return;
  end if;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body    := jsonb_build_object(
                 'chat_id', v_chat,
                 'text',    p_text,
                 'parse_mode', 'HTML',
                 'disable_web_page_preview', true
               ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
exception when others then
  raise notice 'send_telegram failed: %', sqlerrm;
end $$;

grant execute on function public.send_telegram(text) to authenticated;

-- =====================================================================
-- RPC: send_test_notification (admin only) — manual probe button.
-- =====================================================================
create or replace function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.send_telegram(
    '✅ <b>Test notification</b>' || E'\n' ||
    'If you can read this on your phone, Telegram alerts are wired up correctly.'
  );
end $$;

grant execute on function public.send_test_notification() to authenticated;

-- =====================================================================
-- Trigger: on new order
-- =====================================================================
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_msg text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_order, false) then
    return new;
  end if;
  v_msg :=
    '🛒 <b>New order!</b>' || E'\n\n' ||
    '<b>' || coalesce(new.order_number, '?') || '</b>' || E'\n' ||
    'Customer: ' || coalesce(new.customer_name, '?') || E'\n' ||
    'Phone: '    || coalesce(new.customer_phone, '?') || E'\n' ||
    'Total: ৳'   || coalesce(new.total_amount::text, '0');
  perform public.send_telegram(v_msg);
  return new;
exception when others then
  raise notice 'notify_new_order failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
  after insert on public.orders
  for each row execute function public.notify_new_order();

-- =====================================================================
-- Trigger: on new question
-- =====================================================================
create or replace function public.notify_new_question()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_pname text;
  v_msg text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_question, false) then
    return new;
  end if;
  select name into v_pname from public.products where id = new.product_id;
  v_msg :=
    '❓ <b>New question</b>' || E'\n\n' ||
    'Product: ' || coalesce(v_pname, '(unknown)') || E'\n' ||
    'Q: '       || coalesce(new.question, '');
  perform public.send_telegram(v_msg);
  return new;
exception when others then
  raise notice 'notify_new_question failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_new_question on public.questions;
create trigger trg_notify_new_question
  after insert on public.questions
  for each row execute function public.notify_new_question();

-- =====================================================================
-- Trigger: on new review
-- =====================================================================
create or replace function public.notify_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.notification_config%rowtype;
  v_pname text;
  v_msg text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_review, false) then
    return new;
  end if;
  select name into v_pname from public.products where id = new.product_id;
  v_msg :=
    '⭐ <b>New review (' || new.rating || '/5)</b>' || E'\n\n' ||
    'Product: ' || coalesce(v_pname, '(unknown)') || E'\n' ||
    'By: '      || coalesce(new.user_name, '?') ||
    case when new.comment is not null and length(new.comment) > 0
         then E'\n\n' || left(new.comment, 400) else '' end;
  perform public.send_telegram(v_msg);
  return new;
exception when others then
  raise notice 'notify_new_review failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists trg_notify_new_review on public.reviews;
create trigger trg_notify_new_review
  after insert on public.reviews
  for each row execute function public.notify_new_review();
