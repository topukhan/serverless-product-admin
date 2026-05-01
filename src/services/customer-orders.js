import { supabase } from './supabase.js';
import { getCustomerToken } from './customer-auth.js';

export async function getMyOrders(status = null) {
  const token = getCustomerToken();
  if (!token) return [];
  const { data, error } = await supabase.rpc('get_my_orders', {
    p_token: token, p_status: status,
  });
  if (error) throw error;
  return data || [];
}

export async function getMyOrderView(orderNumber) {
  const token = getCustomerToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('get_my_order_view', {
    p_token: token, p_order_number: orderNumber,
  });
  if (error) throw error;
  return data;
}

export async function getMyUnreadMessageCount() {
  const token = getCustomerToken();
  if (!token) return 0;
  const { data, error } = await supabase.rpc('get_my_unread_message_count', {
    p_token: token,
  });
  if (error) return 0;
  return data ?? 0;
}
