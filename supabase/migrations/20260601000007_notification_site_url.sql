-- =====================================================================
-- 07 / Add site_url to notification_config
--   Appended to every notification so the admin can tap/click to open
--   the relevant admin page directly from Telegram or email.
-- =====================================================================

alter table public.notification_config
  add column if not exists site_url text;

-- Re-create notify_new_order to include the order link.
create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg    public.notification_config%rowtype;
  v_subject text;
  v_body    text;
  v_link    text;
begin
  select * into v_cfg from public.notification_config where id = 1;
  if not coalesce(v_cfg.enabled, false) or not coalesce(v_cfg.notify_on_order, false) then
    return new;
  end if;

  v_subject := '🛒 New order ' || coalesce(new.order_number, '?');

  v_link := case
    when v_cfg.site_url is not null and length(trim(v_cfg.site_url)) > 0
    then trim(trailing '/' from v_cfg.site_url) || '/#/admin/orders/' || new.id::text
    else null
  end;

  v_body :=
    'Order: '    || coalesce(new.order_number, '?')   || E'\n' ||
    'Customer: ' || coalesce(new.customer_name, '?')  || E'\n' ||
    'Phone: '    || coalesce(new.customer_phone, '?') || E'\n' ||
    'Total: ৳'   || coalesce(new.total_amount::text, '0');

  if v_link is not null then
    v_body := v_body || E'\n\n' || 'View order: ' || v_link;
  end if;

  perform public.notify_admins(v_subject, v_body);
  return new;
exception when others then
  raise notice 'notify_new_order failed: %', sqlerrm;
  return new;
end $$;

-- Re-create notify_new_question to include the admin link.
create or replace function public.notify_new_question()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg    public.notification_config%rowtype;
  v_pname  text;
  v_subject text;
  v_body    text;
  v_link    text;
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

  v_link := case
    when v_cfg.site_url is not null and length(trim(v_cfg.site_url)) > 0
    then trim(trailing '/' from v_cfg.site_url) || '/#/admin/questions'
    else null
  end;
  if v_link is not null then
    v_body := v_body || E'\n\n' || 'View questions: ' || v_link;
  end if;

  perform public.notify_admins(v_subject, v_body);
  return new;
exception when others then
  raise notice 'notify_new_question failed: %', sqlerrm;
  return new;
end $$;

-- Re-create notify_new_review to include the admin link.
create or replace function public.notify_new_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg    public.notification_config%rowtype;
  v_pname  text;
  v_subject text;
  v_body    text;
  v_link    text;
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

  v_link := case
    when v_cfg.site_url is not null and length(trim(v_cfg.site_url)) > 0
    then trim(trailing '/' from v_cfg.site_url) || '/#/admin/reviews'
    else null
  end;
  if v_link is not null then
    v_body := v_body || E'\n\n' || 'View reviews: ' || v_link;
  end if;

  perform public.notify_admins(v_subject, v_body);
  return new;
exception when others then
  raise notice 'notify_new_review failed: %', sqlerrm;
  return new;
end $$;
