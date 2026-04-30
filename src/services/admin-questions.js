import { supabase } from './supabase.js';

export async function getAdminQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select('*, product:products(id, name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Saving an empty / whitespace-only answer clears it back to null so the
// public Q&A widget shows "Awaiting answer" again.
export async function answerQuestion(id, answer) {
  const trimmed = (answer || '').trim();
  const { data, error } = await supabase
    .from('questions')
    .update({ answer: trimmed === '' ? null : trimmed })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(id) {
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw error;
}

export async function setQuestionEnabled(id, enabled) {
  const { error } = await supabase
    .from('questions').update({ enabled }).eq('id', id);
  if (error) throw error;
}
