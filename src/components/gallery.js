import { escapeHtml } from '../lib/dom.js';

// Product gallery: large main image + clickable thumbnail strip.
// `images` is the de-duplicated [thumbnail, ...gallery] list, max 4.
// If only 1 image exists, no strip is rendered.
export function Gallery(product) {
  const images = [
    product.image_url,
    ...(product.gallery_urls || []),
  ].filter((u) => typeof u === 'string' && u.length > 0);

  const wrap = document.createElement('div');

  if (images.length === 0) {
    wrap.innerHTML = `
      <div class="aspect-square rounded-xl flex items-center justify-center muted"
           style="background: var(--color-bg); border: 1px solid var(--color-border)">
        No image
      </div>`;
    return wrap;
  }

  let active = 0;

  // Main image
  const main = document.createElement('div');
  main.className = 'relative rounded-xl overflow-hidden aspect-square';
  main.style.background = 'var(--color-bg)';
  main.innerHTML = `
    <img data-main src="${images[0]}" alt="${escapeHtml(product.name)}"
         class="w-full h-full object-cover transition-opacity duration-200" />
  `;
  wrap.appendChild(main);

  if (images.length === 1) return wrap;

  // Thumbnail strip
  const strip = document.createElement('div');
  strip.className = 'mt-3 grid grid-cols-4 gap-2 sm:gap-3';

  const thumbs = images.map((url, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `View image ${idx + 1}`);
    b.className =
      'relative aspect-square rounded-md overflow-hidden transition ' +
      'focus:outline-none';
    b.style.background = 'var(--color-bg)';
    b.style.border = '2px solid transparent';
    b.style.padding = '0';
    b.innerHTML = `<img src="${url}" alt="" class="w-full h-full object-cover" />`;
    b.addEventListener('click', () => setActive(idx));
    b.addEventListener('mouseenter', () => preview(idx));
    b.addEventListener('mouseleave', () => preview(active));
    strip.appendChild(b);
    return b;
  });

  function paint() {
    thumbs.forEach((b, i) => {
      b.style.borderColor = i === active ? 'var(--color-primary)' : 'var(--color-border)';
      b.style.opacity = i === active ? '1' : '0.85';
    });
  }
  function setActive(idx) {
    active = idx;
    main.querySelector('[data-main]').src = images[idx];
    paint();
  }
  function preview(idx) {
    main.querySelector('[data-main]').src = images[idx];
  }
  paint();

  wrap.appendChild(strip);
  return wrap;
}
