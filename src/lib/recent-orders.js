// Per-device record of the last few order numbers the user has interacted
// with, so the track-order page can offer them as quick-pick chips.
//
// Stored as a simple array of order_number strings. Most recent first.
// Pushing an existing number bumps it to the top instead of duplicating.

const KEY = 'recent_orders_v1';
const MAX = 5;

export function getRecentOrders() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => typeof s === 'string' && s.length > 0).slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentOrder(orderNumber) {
  if (!orderNumber || typeof orderNumber !== 'string') return;
  const list = getRecentOrders().filter((o) => o !== orderNumber);
  list.unshift(orderNumber);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {}
}

export function clearRecentOrders() {
  try { localStorage.removeItem(KEY); } catch {}
}
