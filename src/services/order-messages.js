import { supabase } from './supabase.js';
import { getCustomerToken } from './customer-auth.js';

// Customer-side: send a message on one of my orders.
export async function customerSendMessage(orderId, body) {
  const token = getCustomerToken();
  if (!token) throw new Error('Please sign in to send messages.');
  const { data, error } = await supabase.rpc('customer_send_order_message', {
    p_token: token, p_order_id: orderId, p_body: body,
  });
  if (error) throw mapMsgError(error);
  return data;
}

export async function customerGetMessages(orderNumber) {
  const token = getCustomerToken();
  if (!token) throw new Error('Please sign in to view this chat.');
  const { data, error } = await supabase.rpc('customer_get_order_messages', {
    p_token: token, p_order_number: orderNumber,
  });
  if (error) throw mapMsgError(error);
  return data;
}

export async function customerMarkRead(orderId) {
  const token = getCustomerToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('customer_mark_order_messages_read', {
    p_token: token, p_order_id: orderId,
  });
  if (error) return null;
  return data;
}

// Admin-side
export async function adminSendMessage(orderId, body) {
  const { data, error } = await supabase.rpc('admin_send_order_message', {
    p_order_id: orderId, p_body: body,
  });
  if (error) throw mapMsgError(error);
  return data;
}

export async function adminGetMessages(orderId) {
  const { data, error } = await supabase.rpc('get_order_messages_for_admin', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data;
}

export async function adminMarkRead(orderId) {
  const { data, error } = await supabase.rpc('admin_mark_order_messages_read', {
    p_order_id: orderId,
  });
  if (error) return null;
  return data;
}

export async function getAdminUnreadMessageCount() {
  const { data, error } = await supabase.rpc('get_admin_unread_message_count');
  if (error) return 0;
  return data ?? 0;
}

function mapMsgError(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('limit_reached'))
    return new Error('Message limit reached for this order.');
  if (m.includes('empty_body'))
    return new Error('Message cannot be empty.');
  if (m.includes('body_too_long'))
    return new Error('Message is too long (max 1000 characters).');
  if (m.includes('forbidden') || m.includes('unauthenticated'))
    return new Error('You do not have permission to send this message.');
  if (m.includes('order_missing'))
    return new Error('Order not found.');
  return err;
}
