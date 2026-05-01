import { supabase } from './supabase.js';

export async function searchCustomers(term, limit = 12) {
  const { data, error } = await supabase.rpc('search_customers', {
    p_term: term || '', p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function listCustomers({ term = '', limit = 30, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('list_customers', {
    p_term: term, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return data || { rows: [], total: 0 };
}

export async function resetCustomerPassword(customerId, newPassword) {
  const { data, error } = await supabase.rpc('admin_reset_customer_password', {
    p_customer_id: customerId, p_new_password: newPassword,
  });
  if (error) throw error;
  return data;
}

export async function createCustomer(payload) {
  const { data, error } = await supabase.rpc('admin_create_customer', { payload });
  if (error) throw mapCreateError(error);
  return data;
}

function mapCreateError(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('phone_taken'))         return new Error('That phone number is already registered.');
  if (m.includes('email_taken'))         return new Error('That email is already registered.');
  if (m.includes('invalid_phone'))       return new Error('Please enter a valid phone number.');
  if (m.includes('invalid_zone'))        return new Error('Please choose a valid delivery zone.');
  if (m.includes('identifier_required')) return new Error('Phone or email is required.');
  if (m.includes('weak_password'))       return new Error('Password must be at least 6 characters.');
  if (m.includes('forbidden'))           return new Error('You do not have permission to do that.');
  return err;
}
