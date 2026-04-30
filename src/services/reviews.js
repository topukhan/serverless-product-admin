import { supabase } from './supabase.js';

export async function getReviews(productId) {
  // RLS already restricts public reads to `enabled = true`, but we filter
  // explicitly here so the behavior is identical for admins browsing the
  // public site as well.
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('enabled', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createReview({ productId, userName, rating, comment }) {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      product_id: productId,
      user_name:  userName.trim(),
      rating,
      comment:    comment.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function reviewStats(reviews) {
  if (!reviews || reviews.length === 0) return { count: 0, average: 0 };
  const total = reviews.reduce((s, r) => s + (r.rating || 0), 0);
  return {
    count:   reviews.length,
    average: Math.round((total / reviews.length) * 10) / 10,
  };
}
