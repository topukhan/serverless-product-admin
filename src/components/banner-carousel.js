import { escapeHtml } from '../lib/dom.js';

export function BannerCarousel(slides) {
  if (!slides || slides.length === 0) return null;

  let current = 0;
  let timer = null;

  const el = document.createElement('section');
  el.className = 'relative overflow-hidden';
  el.style.minHeight = '340px';

  const track = document.createElement('div');
  track.className = 'flex';
  track.style.cssText = 'transition: transform 0.5s ease-in-out;';
  slides.forEach((slide) => track.appendChild(buildSlide(slide)));
  el.appendChild(track);

  // Dot indicators
  const dotsEl = document.createElement('div');
  dotsEl.className = 'absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10';
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.style.cssText = 'border-radius:9999px; height:6px; transition: all 0.3s; background:rgba(255,255,255,0.45); border:none; cursor:pointer;';
    dot.addEventListener('click', () => { stopAuto(); goTo(i); });
    dotsEl.appendChild(dot);
  });
  el.appendChild(dotsEl);

  if (slides.length > 1) {
    const prev = arrowBtn('left');
    const next = arrowBtn('right');
    prev.addEventListener('click', () => { stopAuto(); goTo(current - 1); });
    next.addEventListener('click', () => { stopAuto(); goTo(current + 1); });
    el.append(prev, next);
  }

  function goTo(n) {
    current = ((n % slides.length) + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsEl.querySelectorAll('button').forEach((dot, i) => {
      dot.style.background = i === current ? '#fff' : 'rgba(255,255,255,0.45)';
      dot.style.width = i === current ? '1.5rem' : '0.375rem';
    });
  }

  function startAuto() {
    if (slides.length < 2) return;
    timer = setInterval(() => goTo(current + 1), 4500);
  }
  function stopAuto() { clearInterval(timer); timer = null; }

  el.addEventListener('mouseenter', stopAuto);
  el.addEventListener('mouseleave', startAuto);

  let touchX = null;
  el.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 40) return;
    stopAuto(); goTo(dx < 0 ? current + 1 : current - 1);
  }, { passive: true });

  goTo(0);
  startAuto();
  return el;
}

function resolveHref(slide) {
  if (slide.cta_type === 'product'  && slide.cta_product_id)  return `#/product/${slide.cta_product_id}`;
  if (slide.cta_type === 'category' && slide.cta_category_id) return `#/products?cat=${slide.cta_category_id}`;
  return escapeHtml(slide.cta_url || '#/products');
}

function buildSlide(slide) {
  const align = slide.text_align || 'left';
  const alignClass = align === 'center' ? 'items-center text-center' : align === 'right' ? 'items-end text-right' : 'items-start text-left';
  const href = resolveHref(slide);

  const el = document.createElement('div');
  el.className = 'w-full shrink-0 relative flex items-center';
  el.style.minHeight = '340px';

  if (slide.image_url) {
    const img = document.createElement('img');
    img.src = slide.image_url;
    img.alt = '';
    img.className = 'absolute inset-0 w-full h-full object-cover';
    el.appendChild(img);
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0';
    // Adjust gradient direction based on alignment
    const gradDir = align === 'right' ? 'to left' : align === 'center' ? 'to bottom' : 'to right';
    overlay.style.background = `linear-gradient(${gradDir}, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 65%, rgba(0,0,0,0.08) 100%)`;
    el.appendChild(overlay);
  } else {
    el.style.background = 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)';
  }

  const content = document.createElement('div');
  content.className = `relative z-10 container-x py-16 sm:py-24 w-full flex flex-col ${alignClass}`;
  content.innerHTML = `
    <div class="max-w-xl">
      <h2 class="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15]" style="color:#fff">
        ${escapeHtml(slide.title)}
      </h2>
      ${slide.subtitle ? `
        <p class="mt-4 text-base sm:text-lg leading-relaxed" style="color:rgba(255,255,255,0.82)">
          ${escapeHtml(slide.subtitle)}
        </p>
      ` : ''}
      ${slide.cta_text ? `
        <a href="${href}"
           class="mt-7 inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm font-semibold transition hover:opacity-90"
           style="background:#fff; color:var(--color-primary)">
          ${escapeHtml(slide.cta_text)} <span aria-hidden="true">→</span>
        </a>
      ` : ''}
    </div>
  `;
  el.appendChild(content);
  return el;
}

function arrowBtn(side) {
  const btn = document.createElement('button');
  btn.className = 'absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full transition';
  btn.style.cssText = `width:2.25rem; height:2.25rem; background:rgba(255,255,255,0.18); color:#fff; border:none; cursor:pointer; ${side === 'left' ? 'left:1rem' : 'right:1rem'}`;
  btn.setAttribute('aria-label', side === 'left' ? 'Previous slide' : 'Next slide');
  btn.innerHTML = side === 'left'
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.32)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.18)'; });
  return btn;
}
