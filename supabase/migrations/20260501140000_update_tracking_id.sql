-- =====================================================================
-- Migration: Admin can edit an order's tracking ID after shipment.
-- Useful for typo fixes or when the courier reissues a code. Logs every
-- change to order_events. Admin-only. Idempotent.
-- =====================================================================

create or replace function public.update_order_tracking_id(
  p_order_id uuid, p_tracking_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curr   text;
  v_old_id text;
  v_new_id text := nullif(trim(coalesce(p_tracking_id,'')), '');
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_new_id is null then
    raise exception 'tracking_required' using errcode = '22000';
  end if;

  select status, tracking_id into v_curr, v_old_id
    from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_missing' using errcode = '22000';
  end if;
  -- Allowed only after the parcel has actually been shipped (or beyond).
  if v_curr not in ('shipped','delivered','returned') then
    raise exception 'tracking_locked' using errcode = '22000';
  end if;
  if v_old_id is not distinct from v_new_id then
    return jsonb_build_object('changed', false, 'tracking_id', v_new_id);
  end if;

  update public.orders
     set tracking_id = v_new_id, updated_at = now()
   where id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, note, actor_id)
    values (p_order_id, v_curr, v_curr,
            'Tracking ID updated: ' || coalesce(v_old_id, '∅') || ' → ' || v_new_id,
            auth.uid());

  return jsonb_build_object('changed', true, 'tracking_id', v_new_id);
end $$;

grant execute on function public.update_order_tracking_id(uuid, text) to authenticated;
