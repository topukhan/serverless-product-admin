import { supabase } from './supabase.js';

export async function getQuestions(productId) {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('product_id', productId)
    .eq('enabled', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createQuestion({ productId, question }) {
  // The RLS policy enforces `answer is null` on public inserts.
  const { data, error } = await supabase
    .from('questions')
    .insert({
      product_id: productId,
      question:   question.trim(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
