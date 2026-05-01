-- =====================================================================
-- 04 / Notifications (Telegram + Email via Resend)
--   Uses pg_net for fire-and-forget HTTPS so triggers don't block on a
--   notification provider being slow. Failures are logged via NOTICE only,
--   they NEVER bubble up — a misconfigured channel must not break the
--   originating insert (e.g. a customer placing an order).
-- =====================================================================

create extension if not exists pg_net;

-- ---------- Config singleton ----------
create table if not exists public.notification_config (
  id                  integer primary key default 1,
  enabled             boolean not null default false,

  -- Telegram channel
  telegram_bot_token  text,
  telegram_chat_id    text,

  -- Email channel (Resend)
  email_enabled       boolean not null default false,
  email_api_key       text,
  email_from          text default 'onboarding@resend.dev',
  email_to            text,

  -- Per-event toggles (shared by all enabled channels)
  notify_on_order     boolean not null default true,
  notify_on_question  boolean not null default true,
  notify_on_review    boolean not null default true,

  updated_at          timestamptz not null default now(),
  constraint notification_config_singleton check (id = 1)
);

insert into public.notification_config (id) values (1)
on conflict (id) do nothing;

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

-- Tokens must NOT leak to anon — admin-only access.
create policy "notification_config: admin only"
  on public.notification_config for all
  using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- send_telegram(text) — POST to Telegram bot API
-- =====================================================================
create or replace function public.send_telegram(p_text text)
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_token text; v_chat text; v_enabled boolean;
begin
  select telegram_bot_token, telegram_chat_id, enabled
    into v_token, v_chat, v_enabled
    from public.notification_config where id = 1;

  if not coalesce(v_enabled, false) or v_token is null or v_chat is null
     or length(trim(coalesce(v_token,''))) = 0
     or length(trim(coalesce(v_chat,'')))  = 0 then
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
-- send_email(subject, text) — POST to Resend
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
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.email_enabled, false) then return; end if;
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
-- notify_admins(subject, body) — fan out to every enabled channel
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
-- Test RPCs
-- =====================================================================
create or replace function public.send_test_telegram()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.send_telegram(
    '✅ <b>Test from your store</b>' || E'\n' ||
    'Telegram alerts are wired up correctly.'
  );
end $$;
grant execute on function public.send_test_telegram() to authenticated;

create or replace function public.send_test_email()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.send_email('Test notification from your store',
    'If you can read this, email alerts are wired up correctly.');
end $$;
grant execute on function public.send_test_email() to authenticated;

create or replace function public.send_test_notification()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform public.send_telegram('✅ Test notification (combined).');
  perform public.send_email('Test notification', 'Combined test.');
end $$;
grant execute on function public.send_test_notification() to authenticated;

-- =====================================================================
-- Trigger functions: orders / questions / reviews
-- =====================================================================
create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
  after insert on public.orders
  for each row execute function public.notify_new_order();

create or replace function public.notify_new_question()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_new_question on public.questions;
create trigger trg_notify_new_question
  after insert on public.questions
  for each row execute function public.notify_new_question();

create or replace function public.notify_new_review()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists trg_notify_new_review on public.reviews;
create trigger trg_notify_new_review
  after insert on public.reviews
  for each row execute function public.notify_new_review();

-- ---------- Table grants ----------
grant select, insert, update, delete on public.notification_config to authenticated;
