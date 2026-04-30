import { formatPrice } from '../services/products.js';
import { addToCart } from '../services/cart.js';
import { getFlag } from '../services/branding.js';
import { escapeHtml } from '../lib/dom.js';

// `stats` is { avg, count } from getCatalog().reviewStats. Falsy = no reviews.
export function ProductCard(p, { stats } = {}) {
  const card = document.createElement('article');
  card.className = 'group card overflow-hidden transition hover:shadow-md';

  const hasGallery = Array.isArray(p.gallery_urls) && p.gallery_urls.length > 0;
  const hoverImg = hasGallery ? p.gallery_urls[0] : null;

  // Image + title region — clickable.
  const link = document.createElement('a');
  link.href = `#/product/${p.id}`;
  link.className = 'block focus:outline-none';

  // "Sold out" always shows. Low-stock badge text changes based on show_stock:
  //   ON  → "Only 3 left"   (reveal the number)
  //   OFF → "Low stock"     (generic urgency)
  const showStock = getFlag('show_stock');
  const stockTag =
    p.stock <= 0
      ? `<span class="absolute top-3 left-3 text-[11px] font-medium px-2 py-1 rounded-full"
              style="background:#fee2e2;color:#991b1b">Sold out</span>`
      : p.stock < 5
      ? `<span class="absolute top-3 left-3 text-[11px] font-medium px-2 py-1 rounded-full"
              style="background:#fef3c7;color:#92400e">${
                showStock ? `Only ${p.stock} left` : 'Low stock'
              }</span>`
      : '';

  const galleryDot =
    hasGallery
      ? `<span class="absolute bottom-3 right-3 text-[10px] font-medium px-1.5 py-0.5 rounded
              backdrop-blur-sm"
              style="background: rgb(255 255 255 / 0.85); color: var(--color-text)">
           +${p.gallery_urls.length}
         </span>`
      : '';

  const baseImg = p.image_url
    ? `<img data-base src="${p.image_url}" alt="${escapeHtml(p.name)}"
            loading="lazy"
            class="w-full h-full object-cover transition duration-500" />`
    : `<div class="w-full h-full flex items-center justify-center muted text-sm"
              style="background: var(--color-bg)">No image</div>`;

  const hoverImgEl = hoverImg
    ? `<img data-hover src="${hoverImg}" alt=""
            loading="lazy" aria-hidden="true"
            class="absolute inset-0 w-full h-full object-cover opacity-0
                   transition-opacity duration-500 group-hover:opacity-100" />`
    : '';

  const showSold = getFlag('show_sold');
  const soldFrag = showSold && Number(p.sold) > 0
    ? `<span class="muted">${formatSold(p.sold)} sold</span>`
    : '';
  const ratingFrag = stats && stats.count > 0
    ? `<span style="color: var(--color-accent)">${ratingStars(stats.avg)}</span>
       <span class="muted">${stats.avg.toFixed(1)} (${stats.count})</span>`
    : '';
  const ratingRow = (ratingFrag || soldFrag)
    ? `<div class="mt-1 flex items-center gap-1.5 text-xs flex-wrap">
         ${ratingFrag}${(ratingFrag && soldFrag) ? `<span class="muted">·</span>` : ''}${soldFrag}
       </div>`
    : '';

  link.innerHTML = `
    <div class="relative aspect-square overflow-hidden"
         style="background: var(--color-bg)">
      <div class="relative w-full h-full transition duration-500 group-hover:scale-[1.03]">
        ${baseImg}
        ${hoverImgEl}
      </div>
      ${stockTag}
      ${galleryDot}
    </div>
    <div class="px-4 pt-4">
      <h3 class="font-medium leading-snug line-clamp-1 group-hover:underline decoration-1 underline-offset-2">
        ${escapeHtml(p.name)}
      </h3>
      ${ratingRow}
    </div>
  `;
  card.appendChild(link);

  // Footer: price + quick-add button.
  const footer = document.createElement('div');
  footer.className = 'px-4 pt-1 pb-4 mt-1 flex items-center justify-between gap-3';
  footer.innerHTML = `
    <div class="min-w-0">
      <div class="text-lg font-semibold tracking-tight" style="color: var(--color-primary)">
        ${formatPrice(p.price)}
      </div>
    </div>
    <button data-add type="button"
            class="inline-flex items-center justify-center w-9 h-9 rounded-full transition shrink-0"
            style="background: var(--color-primary-soft); color: var(--color-primary)"
            aria-label="Add ${escapeHtml(p.name)} to cart"
            ${p.stock <= 0 ? 'disabled' : ''}>
      <svg data-icon-add width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      <svg data-icon-ok class="hidden" width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    </button>
  `;

  const btn      = footer.querySelector('[data-add]');
  const iconAdd  = footer.querySelector('[data-icon-add]');
  const iconOk   = footer.querySelector('[data-icon-ok]');

  if (p.stock > 0) {
    btn.addEventListener('click', () => {
      addToCart(p.id, 1);
      iconAdd.classList.add('hidden');
      iconOk.classList.remove('hidden');
      btn.style.background = 'var(--color-primary)';
      btn.style.color = '#fff';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        iconAdd.classList.remove('hidden');
        iconOk.classList.add('hidden');
        btn.style.background = 'var(--color-primary-soft)';
        btn.style.color = 'var(--color-primary)';
      }, 1200);
    });
  }

  card.appendChild(footer);
  return card;
}

// Rounded half-stars: rating 4.6 → ★★★★★ (visual rounded), 4.3 → ★★★★☆.
function ratingStars(avg) {
  const r = Math.round(avg);
  return '★'.repeat(r) + `<span style="color: var(--color-border)">${'☆'.repeat(5 - r)}</span>`;
}

// "1234" → "1,234"; small enough to not need k/M abbreviations yet.
function formatSold(n) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, parseInt(n, 10) || 0));
}
