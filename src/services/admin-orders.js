import { supabase } from './supabase.js';

// List orders with filters. Returns { rows, total }.
//   filters: { status, q (search), from, to, limit, offset }
export async function listOrders({
  status = null,
  q = null,
  from = null,
  to = null,
  limit = 30,
  offset = 0,
} = {}) {
  let query = supabase
    .from('orders')
    .select(
      'id, order_number, status, customer_name, customer_phone, total_amount, tracking_id, placed_at, viewed_at',
      { count: 'exact' }
    )
    .order('placed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (from) query = query.gte('placed_at', from);
  if (to)   query = query.lte('placed_at', to);
  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(
      `order_number.ilike.%${term}%,customer_phone.ilike.%${term}%,customer_name.ilike.%${term}%,tracking_id.ilike.%${term}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], total: count ?? 0 };
}

export async function getAdminOrder(id) {
  const { data: order, error } = await supabase
    .from('orders').select('*').eq('id', id).single();
  if (error) throw error;

  const [{ data: items }, { data: events }] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', id).order('product_name'),
    supabase.from('order_events').select('*').eq('order_id', id).order('created_at'),
  ]);

  return { ...order, items: items || [], events: events || [] };
}

export async function updateOrderStatus({ orderId, newStatus, trackingId = null, note = null }) {
  const { data, error } = await supabase.rpc('update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_tracking_id: trackingId,
    p_note: note,
  });
  if (error) throw error;
  return data;
}

export async function updateOrderTrackingId({ orderId, trackingId }) {
  const { data, error } = await supabase.rpc('update_order_tracking_id', {
    p_order_id: orderId,
    p_tracking_id: trackingId,
  });
  if (error) throw error;
  return data;
}

export async function updateOrderCharges({ orderId, discount, charge }) {
  const { data, error } = await supabase.rpc('update_order_charges', {
    p_order_id: orderId,
    p_discount: discount,
    p_charge: charge,
  });
  if (error) throw error;
  return data;
}

export async function getDashboardStats({ from = null, to = null } = {}) {
  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data || { by_status: {}, pending_total: 0 };
}

export async function getPendingOrderCount() {
  const { data, error } = await supabase.rpc('get_pending_order_count');
  if (error) throw error;
  return data ?? 0;
}

// Mark an order as viewed by the admin. Idempotent (only sets the timestamp
// if it's still null). Failures are non-fatal — the badge will catch up on
// the next navigation.
export async function markOrderViewed(orderId) {
  await supabase
    .from('orders')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('viewed_at', null)
    .then(() => null, () => null);
}
