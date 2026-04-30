// Per-product question cap, localStorage. Mirrors review-limit pattern but
// no global cap: only per-product.

const KEY = 'questions_per_product_v1';
export const MAX_PER_PRODUCT = 5;

function readMap() {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
function writeMap(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function questionsAskedFor(productId) {
  const n = readMap()[productId];
  return Number.isFinite(n) ? n : 0;
}
export function questionsRemainingFor(productId) {
  return Math.max(0, MAX_PER_PRODUCT - questionsAskedFor(productId));
}
export function canAskQuestionFor(productId) {
  return questionsRemainingFor(productId) > 0;
}
export function noteQuestionAskedFor(productId) {
  const map = readMap();
  map[productId] = (map[productId] || 0) + 1;
  writeMap(map);
}
