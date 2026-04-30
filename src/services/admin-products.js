import { supabase } from './supabase.js';

const PRODUCTS_BUCKET = 'products';

/* ---------- Reads ---------- */

export async function getAdminProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAdminProduct(id) {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_categories(category_id)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return {
    ...data,
    category_ids: (data.product_categories || []).map((r) => r.category_id),
  };
}

export async function getAllCategories() {
  const { data, error } = await supabase
    .from('categories').select('*').order('name');
  if (error) throw error;
  return data;
}

/* ---------- Writes ---------- */

export async function createProduct(payload, categoryIds = []) {
  const { data, error } = await supabase
    .from('products').insert(payload).select().single();
  if (error) throw error;
  if (categoryIds.length > 0) await syncCategories(data.id, categoryIds);
  return data;
}

export async function updateProduct(id, payload, categoryIds = null) {
  const { data, error } = await supabase
    .from('products').update(payload).eq('id', id).select().single();
  if (error) throw error;
  if (categoryIds !== null) await syncCategories(id, categoryIds);
  return data;
}

export async function deleteProduct(product) {
  // Best-effort: remove storage objects we own. External URLs are skipped.
  const owned = imageUrlsOwnedByUs(product);
  if (owned.length) {
    await supabase.storage.from(PRODUCTS_BUCKET).remove(owned).catch(() => {});
  }
  // Cascade in DB drops product_categories, reviews, questions automatically.
  const { error } = await supabase.from('products').delete().eq('id', product.id);
  if (error) throw error;
}

async function syncCategories(productId, categoryIds) {
  await supabase.from('product_categories').delete().eq('product_id', productId);
  if (categoryIds.length === 0) return;
  const rows = categoryIds.map((cid) => ({ product_id: productId, category_id: cid }));
  const { error } = await supabase.from('product_categories').insert(rows);
  if (error) throw error;
}

/* ---------- Storage helpers ---------- */

export async function uploadProductImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const path = `${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from(PRODUCTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Convert a public URL back to a storage path if it points at our bucket.
export function pathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PRODUCTS_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

function imageUrlsOwnedByUs(product) {
  const all = [product.image_url, ...(product.gallery_urls || [])];
  return all.map(pathFromPublicUrl).filter(Boolean);
}

export async function deleteProductImageByUrl(url) {
  const path = pathFromPublicUrl(url);
  if (!path) return; // external URL — nothing for us to delete
  await supabase.storage.from(PRODUCTS_BUCKET).remove([path]).catch(() => {});
}
