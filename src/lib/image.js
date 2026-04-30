// Convert any raster image File to a WebP File, optionally downscaled.
// SVG/GIF are passed through unchanged (vector / animated formats).
// On any failure (e.g. browser can't encode WebP) the original File is returned.
//
//   const slim = await toWebp(file);     // 0.85 quality, max 2000px
//   const slim = await toWebp(file, { quality: 0.9, maxDim: 1600 });
export async function toWebp(file, { quality = 0.85, maxDim = 2000 } = {}) {
  if (!file || !file.type.startsWith('image/')) return file;
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    // Downscale if either side exceeds maxDim (cheap big-photo guard).
    const longest = Math.max(width, height);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: 'image/webp', quality })
      : await new Promise((resolve) =>
          canvas.toBlob(resolve, 'image/webp', quality)
        );

    if (!blob || blob.type !== 'image/webp') return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn('[image] WebP conversion failed, uploading original:', err);
    return file;
  }
}
