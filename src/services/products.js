import { supabase } from './supabase.js';

// Fetch products + categories + their links + per-product review aggregates
// in one round of parallel queries, then join client-side. RLS on the public
// site filters categories.enabled = true and reviews.enabled = true, so
// disabled rows naturally disappear from the catalog.
export async function getCatalog() {
  const [products, categories, junction, reviews] = await Promise.all([
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').eq('enabled', true).order('name'),
    supabase.from('product_categories').select('*'),
    supabase.from('reviews').select('product_id, rating').eq('enabled', true),
  ]);

  if (products.error)   throw products.error;
  if (categories.error) throw categories.error;
  if (junction.error)   throw junction.error;
  if (reviews.error)    throw reviews.error;

  const catsByProduct = new Map();
  for (const row of junction.data) {
    if (!catsByProduct.has(row.product_id)) catsByProduct.set(row.product_id, []);
    catsByProduct.get(row.product_id).push(row.category_id);
  }

  // Map<productId, { avg, count }>
  const sums = new Map();
  for (const r of reviews.data || []) {
    const cur = sums.get(r.product_id) || { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count++;
    sums.set(r.product_id, cur);
  }
  const reviewStats = new Map();
  for (const [pid, { sum, count }] of sums) {
    reviewStats.set(pid, {
      avg: Math.round((sum / count) * 10) / 10,
      count,
    });
  }

  return {
    products:   products.data,
    categories: categories.data,
    catsByProduct,
    reviewStats,
  };
}

export async function getProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Taka (BDT) formatter. Uses the ৳ glyph + Western-style grouping for
// cross-browser consistency. Prices that are whole numbers render without
// decimals; fractional prices keep two decimals.
export function formatPrice(n) {
  const v = Number(n) || 0;
  const hasDecimals = v % 1 !== 0;
  const formatted = v.toLocaleString('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `৳${formatted}`;
}
