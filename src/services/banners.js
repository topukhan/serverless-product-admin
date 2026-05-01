import { supabase } from './supabase.js';
import { toWebp } from '../lib/image.js';

const BANNERS_BUCKET = 'banners';

export async function getBannerSlides() {
  const { data, error } = await supabase
    .from('banner_slides')
    .select('*')
    .eq('enabled', true)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function getAllBannerSlides() {
  const { data, error } = await supabase
    .from('banner_slides')
    .select('*')
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function saveBannerSlide(slide) {
  const fields = {
    title:           slide.title,
    subtitle:        slide.subtitle,
    image_url:       slide.image_url,
    text_align:      slide.text_align || 'left',
    cta_text:        slide.cta_text,
    cta_type:        slide.cta_type || 'url',
    cta_url:         slide.cta_url,
    cta_product_id:  slide.cta_product_id || null,
    cta_category_id: slide.cta_category_id || null,
    sort_order:      slide.sort_order,
    enabled:         slide.enabled,
  };
  if (slide.id) {
    const { error } = await supabase.from('banner_slides').update(fields).eq('id', slide.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('banner_slides').insert(fields);
    if (error) throw error;
  }
}

export async function deleteBannerSlide(id) {
  const { error } = await supabase.from('banner_slides').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleBannerSlide(id, enabled) {
  const { error } = await supabase.from('banner_slides').update({ enabled }).eq('id', id);
  if (error) throw error;
}

export async function uploadBannerImage(file) {
  const slim = await toWebp(file, { maxDim: 2400 });
  const ext = (slim.name.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const path = `${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage
    .from(BANNERS_BUCKET)
    .upload(path, slim, { contentType: slim.type, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BANNERS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
