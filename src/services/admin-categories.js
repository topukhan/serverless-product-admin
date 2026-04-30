import { supabase } from './supabase.js';

// Returns categories alphabetically with a `productCount` (how many products
// link to each via product_categories).
export async function getAdminCategories() {
  const [cats, junction] = await Promise.all([
    supabase.from('categories').select('*').order('name'),
    supabase.from('product_categories').select('category_id'),
  ]);
  if (cats.error) throw cats.error;
  if (junction.error) throw junction.error;

  const counts = new Map();
  for (const r of junction.data || []) {
    counts.set(r.category_id, (counts.get(r.category_id) || 0) + 1);
  }

  return (cats.data || []).map((c) => ({
    ...c,
    productCount: counts.get(c.id) || 0,
  }));
}

export async function createCategory(name) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) throw friendlyError(error);
  return data;
}

export async function renameCategory(id, name) {
  const { data, error } = await supabase
    .from('categories')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw friendlyError(error);
  return data;
}

// Deletes the category. Junction rows in product_categories are removed
// automatically by the schema's ON DELETE CASCADE — products stay, they
// just lose this category tag.
export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function setCategoryEnabled(id, enabled) {
  const { error } = await supabase
    .from('categories').update({ enabled }).eq('id', id);
  if (error) throw error;
}

function friendlyError(error) {
  // Postgres unique_violation on categories_name_key.
  if (error.code === '23505') {
    return new Error('A category with this name already exists.');
  }
  return error;
}
