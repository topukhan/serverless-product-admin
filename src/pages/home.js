import { getBranding } from '../services/branding.js';
import { getCatalog } from '../services/products.js';
import { getBannerSlides } from '../services/banners.js';
import { ProductCard } from '../components/product-card.js';
import { BannerCarousel } from '../components/banner-carousel.js';
import { escapeHtml } from '../lib/dom.js';

export async function HomePage() {
  const b = getBranding();
  const root = document.createElement('div');

  // Banner carousel (admin-managed). Falls back to static hero if no slides.
  let slides = [];
  try { slides = await getBannerSlides(); } catch { /* non-fatal */ }

  const carousel = BannerCarousel(slides);
  if (carousel) {
    root.appendChild(carousel);
  } else {
    root.appendChild(Hero(b));
  }

  root.appendChild(await Featured());
  root.appendChild(Highlights());
  return root;
}

function Hero(b) {
  const el = document.createElement('section');
  el.className = 'container-x section';
  el.innerHTML = `
    <div class="max-w-2xl">
      <h1 class="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
        ${escapeHtml(b.site_name)}
      </h1>
      <p class="mt-4 text-lg muted max-w-xl leading-relaxed">
        Browse and buy. Catalog, brand, and theme all managed from the admin panel.
      </p>
      <div class="mt-7 flex flex-wrap gap-3">
        <a href="#/products" class="btn btn-primary">
          Browse products <span aria-hidden="true">→</span>
        </a>
        <a href="#/cart" class="btn btn-ghost">View cart</a>
      </div>
    </div>
  `;
  return el;
}

async function Featured() {
  const wrap = document.createElement('section');
  wrap.className = 'container-x pb-4 pt-10';
  wrap.innerHTML = `
    <div class="flex items-end justify-between gap-4 mb-6">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Featured</h2>
        <p class="text-sm muted mt-1">A look at what's in the catalog.</p>
      </div>
      <a href="#/products" class="text-sm font-medium hover:underline" style="color: var(--color-primary)">
        See all →
      </a>
    </div>
    <div data-grid class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"></div>
  `;
  const grid = wrap.querySelector('[data-grid]');

  try {
    const { products, reviewStats } = await getCatalog();
    const top = products.slice(0, 4);
    if (top.length === 0) {
      grid.outerHTML = `
        <div class="text-center py-12 rounded-lg muted"
             style="border:1px dashed var(--color-border); background: var(--color-surface)">
          No products have been added yet.
        </div>`;
      return wrap;
    }
    top.forEach((p) => grid.appendChild(ProductCard(p, { stats: reviewStats.get(p.id) })));
  } catch (e) {
    grid.outerHTML = `<div class="p-4 rounded-lg" style="background:#fef2f2;color:#991b1b">Failed to load products: ${escapeHtml(e.message)}</div>`;
  }

  return wrap;
}

function Highlights() {
  const el = document.createElement('section');
  el.className = 'container-x section';
  el.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-3">
      ${highlight('Real-time',  'Catalog updates show up instantly. No build, no deploy.')}
      ${highlight('Brandable',  'Colors, name, logo and theme all editable from admin.')}
      ${highlight('Calm by default', 'Friendly UX, soft palette, and a guest-friendly cart.')}
    </div>
  `;
  return el;
}

function highlight(title, body) {
  return `
    <div class="card p-6">
      <div class="w-1.5 h-6 rounded-full" style="background: var(--color-primary)"></div>
      <h3 class="mt-4 font-semibold">${title}</h3>
      <p class="mt-1 text-sm muted leading-relaxed">${body}</p>
    </div>
  `;
}
