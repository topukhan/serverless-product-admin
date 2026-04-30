import { supabase } from './supabase.js';
import { toWebp } from '../lib/image.js';

const BRANDING_BUCKET = 'branding';

/* ---------- Settings (site identity + active theme) ---------- */

export async function getSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateSiteIdentity({ site_name, font_family }) {
  const patch = {};
  if (typeof site_name === 'string') patch.site_name = site_name.trim();
  if (typeof font_family === 'string') patch.font_family = font_family.trim();
  const { data, error } = await supabase
    .from('settings')
    .update(patch)
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ---------- Branding asset (logo / favicon) ---------- */

// kind: 'logo' | 'favicon'
// Favicons are kept small (256px max) so the file stays light; logos get the
// usual 2000px ceiling.
export async function uploadBrandingAsset(file, kind) {
  const slim = kind === 'favicon'
    ? await toWebp(file, { maxDim: 256, quality: 0.9 })
    : await toWebp(file);
  const ext = (slim.name.split('.').pop() || 'png').toLowerCase();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'png';
  const path = `${kind}-${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, slim, { contentType: slim.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function setBrandingAssetUrl(kind, url) {
  const column = kind === 'logo' ? 'logo_url' : 'favicon_url';
  const { data, error } = await supabase
    .from('settings')
    .update({ [column]: url || null })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function pathFromBrandingUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BRANDING_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

export async function deleteBrandingAssetByUrl(url) {
  const path = pathFromBrandingUrl(url);
  if (!path) return;
  await supabase.storage.from(BRANDING_BUCKET).remove([path]).catch(() => {});
}

/* ---------- Themes ---------- */

export async function listThemes() {
  const { data, error } = await supabase
    .from('themes')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createTheme(payload) {
  const { data, error } = await supabase
    .from('themes')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTheme(id, payload) {
  const { data, error } = await supabase
    .from('themes')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTheme(id) {
  const { error } = await supabase
    .from('themes')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function setDarkTheme(themeId) {
  const { data, error } = await supabase
    .from('settings')
    .update({ dark_theme_id: themeId || null })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setActiveTheme(themeId) {
  const { data, error } = await supabase
    .from('settings')
    .update({ active_theme_id: themeId })
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}
