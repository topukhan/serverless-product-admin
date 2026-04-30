// Guest cart — pure browser state, no Supabase. Persists per browser via
// localStorage. Other parts of the app subscribe to the `cart:change` event
// to update badges/counters.

const KEY = 'cart_v1';
const EVENT = 'cart:change';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: items }));
}

export function getCart() {
  return read();
}

export function cartCount() {
  return read().reduce((n, it) => n + (it.qty || 0), 0);
}

export function addToCart(productId, qty = 1) {
  const items = read();
  const existing = items.find((it) => it.productId === productId);
  if (existing) existing.qty += qty;
  else items.push({ productId, qty });
  write(items);
}

export function setQty(productId, qty) {
  const items = read().map((it) =>
    it.productId === productId ? { ...it, qty: Math.max(0, qty) } : it
  ).filter((it) => it.qty > 0);
  write(items);
}

export function removeFromCart(productId) {
  write(read().filter((it) => it.productId !== productId));
}

export function clearCart() {
  write([]);
}

export function onCartChange(handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
