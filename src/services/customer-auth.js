import { supabase } from './supabase.js';

// =====================================================================
// Self-managed customer auth.
//   Customers register with phone or email + password. We hash the
//   password ourselves (bcrypt, in Postgres) and the server returns an
//   opaque session token that we keep in localStorage. Every customer-
//   facing RPC takes that token. No Supabase Auth involvement, so no
//   confirmation emails, no SMTP rate limits.
//
// localStorage key: customer_token_v1 (uuid string)
// =====================================================================

const TOKEN_KEY = 'customer_token_v1';
const PROFILE_KEY = 'customer_profile_v1';
const AUTH_EVENT = 'customer-auth:changed';

let cachedProfile = undefined; // undefined = not loaded; null = signed out

export function getCustomerToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function isCustomerLoggedIn() {
  return !!getCustomerToken();
}

function setCustomerSession(token, profile) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {}
  cachedProfile = profile || null;
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { profile } }));
}

export function getCachedCustomerProfile() {
  if (cachedProfile !== undefined) return cachedProfile;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    cachedProfile = raw ? JSON.parse(raw) : null;
  } catch { cachedProfile = null; }
  return cachedProfile;
}

export function onCustomerAuthChange(handler) {
  const listener = (e) => handler(e.detail?.profile ?? null);
  window.addEventListener(AUTH_EVENT, listener);
  return () => window.removeEventListener(AUTH_EVENT, listener);
}

export async function registerCustomer({ identifier, password, fullName }) {
  if (!identifier || identifier.trim().length < 3)
    throw new Error('Please enter a phone or email.');
  if (!password || password.length < 6)
    throw new Error('Password must be at least 6 characters.');

  const { data, error } = await supabase.rpc('register_customer', {
    payload: {
      identifier: identifier.trim(),
      password,
      full_name: (fullName || '').trim() || null,
    },
  });
  if (error) throw mapError(error);
  return data;
}

export async function loginCustomer({ identifier, password }) {
  const { data, error } = await supabase.rpc('login_customer', {
    p_identifier: (identifier || '').trim(),
    p_password: password || '',
  });
  if (error) throw mapError(error);
  // Server responds with token + profile snapshot.
  setCustomerSession(data.token, {
    customer_id: data.customer_id,
    full_name:   data.full_name,
    phone:       data.phone,
    email:       data.email,
  });
  return data;
}

// Same shape as loginCustomer's response — used after registration so the
// freshly created token starts a session immediately.
export function applyCustomerSession(data) {
  setCustomerSession(data.token, {
    customer_id: data.customer_id,
    full_name:   data.full_name,
    phone:       data.phone,
    email:       data.email,
  });
}

export async function logoutCustomer() {
  const token = getCustomerToken();
  if (token) {
    try { await supabase.rpc('logout_customer', { p_token: token }); } catch {}
  }
  setCustomerSession(null, null);
}

export async function fetchCustomerProfile() {
  const token = getCustomerToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc('get_customer_by_token', { p_token: token });
  if (error) throw error;
  if (!data) {
    // Token invalid / expired — clean up.
    setCustomerSession(null, null);
    return null;
  }
  // Refresh the cached snapshot.
  cachedProfile = data;
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(data)); } catch {}
  return data;
}

export async function updateCustomerProfile(payload) {
  const token = getCustomerToken();
  if (!token) throw new Error('You are not signed in.');
  const { data, error } = await supabase.rpc('update_customer_profile', {
    p_token: token, payload,
  });
  if (error) throw mapError(error);
  // Refresh cache so the header etc. see the new name immediately.
  await fetchCustomerProfile();
  return data;
}

export async function changeCustomerPassword({ oldPassword, newPassword }) {
  const token = getCustomerToken();
  if (!token) throw new Error('You are not signed in.');
  if (!newPassword || newPassword.length < 6)
    throw new Error('New password must be at least 6 characters.');
  const { data, error } = await supabase.rpc('change_customer_password', {
    p_token: token,
    p_old_password: oldPassword || '',
    p_new_password: newPassword,
  });
  if (error) throw mapError(error);
  return data;
}

function mapError(err) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('locked_until')) {
    // Postgres re-raises the message with a timestamp; turn it into minutes-from-now.
    const stamp = (err.message || '').split(':').slice(1).join(':').trim();
    const until = stamp ? new Date(stamp) : null;
    if (until && !isNaN(until)) {
      const mins = Math.max(1, Math.ceil((until - new Date()) / 60000));
      return new Error(`Too many failed attempts. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    return new Error('Too many failed attempts. Try again later.');
  }
  if (m.includes('invalid_credentials')) return new Error('Wrong phone/email or password.');
  if (m.includes('phone_taken'))         return new Error('That phone number is already registered.');
  if (m.includes('email_taken'))         return new Error('That email is already registered.');
  if (m.includes('weak_password'))       return new Error('Password must be at least 6 characters.');
  if (m.includes('invalid_phone'))       return new Error('Please enter a valid phone number.');
  if (m.includes('invalid_identifier'))  return new Error('Please enter a phone or email.');
  if (m.includes('invalid_zone'))        return new Error('Please choose a valid delivery zone.');
  if (m.includes('unauthenticated'))     return new Error('Please sign in again.');
  if (m.includes('customer_missing'))    return new Error('Customer not found.');
  return err;
}
