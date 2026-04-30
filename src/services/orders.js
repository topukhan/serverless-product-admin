import { supabase } from './supabase.js';

// Place an order. `cart` is the local cart array [{ productId, qty }, ...].
// `customer` is { name, phone, address, note? }.
// Returns { order_number, total_amount, ... } from the RPC.
export async function placeOrder(customer, cart) {
  const items = cart.map((c) => ({
    product_id: c.productId,
    qty: c.qty,
  }));

  const payload = {
    customer_name:    customer.name?.trim(),
    customer_phone:   customer.phone?.trim(),
    customer_address: customer.address?.trim(),
    customer_note:    customer.note?.trim() || null,
    delivery_zone:    customer.deliveryZone, // 'inside_dhaka' | 'outside_dhaka'
    items,
  };

  const { data, error } = await supabase.rpc('place_order', { payload });
  if (error) throw mapOrderError(error);
  return data;
}

// Public order lookup by order_number. Returns null if not found.
export async function getOrderView(orderNumber) {
  const { data, error } = await supabase
    .rpc('get_order_view', { p_order_number: orderNumber });
  if (error) throw error;
  return data;
}

// Search by order_number OR tracking_id. Returns matched order_number or null.
export async function findOrder(query) {
  const { data, error } = await supabase
    .rpc('find_order_lookup', { p_query: query });
  if (error) throw error;
  return data;
}

// Translate Postgres errors into user-friendly Error objects with stable codes.
function mapOrderError(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('rate_limit')) {
    return Object.assign(new Error('You\'ve placed too many orders recently. Please wait a few minutes and try again.'), { code: 'rate_limit' });
  }
  if (m.includes('insufficient_stock')) {
    const name = err.message.split(':')[1] || 'an item';
    return Object.assign(new Error(`Not enough stock for "${name.trim()}". Please reduce quantity.`), { code: 'stock' });
  }
  if (m.includes('product_missing')) {
    return Object.assign(new Error('One of the items is no longer available.'), { code: 'missing' });
  }
  if (m.includes('invalid_name')) {
    return Object.assign(new Error('Please enter your full name.'), { code: 'name' });
  }
  if (m.includes('invalid_phone')) {
    return Object.assign(new Error('Please enter a valid phone number.'), { code: 'phone' });
  }
  if (m.includes('invalid_address')) {
    return Object.assign(new Error('Please enter your full delivery address.'), { code: 'address' });
  }
  if (m.includes('empty_cart')) {
    return Object.assign(new Error('Your cart is empty.'), { code: 'cart' });
  }
  if (m.includes('invalid_zone')) {
    return Object.assign(new Error('Please choose a delivery zone.'), { code: 'zone' });
  }
  return err;
}

export const ZONE_LABELS = {
  inside_dhaka:  'Inside Dhaka',
  outside_dhaka: 'Outside Dhaka',
};

export const ORDER_STATUSES = [
  'pending', 'approved', 'shipped', 'delivered', 'cancelled', 'returned',
];

export const STATUS_META = {
  pending:   { label: 'Pending',   tone: '#92400e', bg: '#fef3c7' },
  approved:  { label: 'Approved',  tone: '#1d4ed8', bg: '#dbeafe' },
  shipped:   { label: 'Shipped',   tone: '#6d28d9', bg: '#ede9fe' },
  delivered: { label: 'Delivered', tone: '#166534', bg: '#dcfce7' },
  cancelled: { label: 'Cancelled', tone: '#b91c1c', bg: '#fee2e2' },
  returned:  { label: 'Returned',  tone: '#475569', bg: '#e2e8f0' },
};
