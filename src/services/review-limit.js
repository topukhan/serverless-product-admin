// Per-device review limits. Both bypassable (localStorage), but enough
// spam ceiling for guest reviews.
//
//   - Global cap: MAX_REVIEWS reviews per device, total
//   - Per-product cap: 1 review per product per device

const KEY_GLOBAL   = 'reviews_submitted_v1';
const KEY_PRODUCTS = 'reviews_per_product_v1';

export const MAX_REVIEWS     = 5;
export const MAX_PER_PRODUCT = 1;

export function reviewsSubmitted() {
  return parseInt(localStorage.getItem(KEY_GLOBAL) || '0', 10) || 0;
}
export function reviewsRemaining() {
  return Math.max(0, MAX_REVIEWS - reviewsSubmitted());
}
export function canSubmitReview() {
  return reviewsRemaining() > 0;
}

function readProducts() {
  try {
    const raw = localStorage.getItem(KEY_PRODUCTS);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
function writeProducts(map) {
  localStorage.setItem(KEY_PRODUCTS, JSON.stringify(map));
}

export function hasReviewedProduct(productId) {
  return !!readProducts()[productId];
}

// Combined check used by the public form.
export function canSubmitReviewFor(productId) {
  return canSubmitReview() && !hasReviewedProduct(productId);
}

export function noteReviewSubmittedFor(productId) {
  localStorage.setItem(KEY_GLOBAL, String(reviewsSubmitted() + 1));
  const map = readProducts();
  map[productId] = true;
  writeProducts(map);
}
