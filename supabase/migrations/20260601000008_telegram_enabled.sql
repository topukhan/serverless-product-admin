-- =====================================================================
-- 08 / Per-channel enable flag for Telegram
-- =====================================================================

alter table public.notification_config
  add column if not exists telegram_enabled boolean not null default true;

-- Re-create send_telegram to respect the per-channel flag.
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
  v_tg_on   boolean;
begin
  select telegram_bot_token, telegram_chat_id, enabled, telegram_enabled
    into v_token, v_chat, v_enabled, v_tg_on
    from public.notification_config where id = 1;

  if not coalesce(v_enabled, false)
     or not coalesce(v_tg_on, true)
     or v_token is null or v_chat is null
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
