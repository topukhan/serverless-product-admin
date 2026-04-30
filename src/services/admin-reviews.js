import { supabase } from './supabase.js';

// All reviews newest-first, with the product they're attached to. Joined via
// the FK on reviews.product_id → products.id.
export async function getAdminReviews() {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, product:products(id, name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function deleteReview(id) {
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) throw error;
}

export async function setReviewEnabled(id, enabled) {
  const { error } = await supabase
    .from('reviews').update({ enabled }).eq('id', id);
  if (error) throw error;
}
