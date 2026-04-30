import { getBranding } from '../services/branding.js';
import { getCatalog } from '../services/products.js';
import { ProductCard } from '../components/product-card.js';
import { escapeHtml } from '../lib/dom.js';

export async function HomePage() {
  const b = getBranding();
  const root = document.createElement('div');

  root.appendChild(Hero(b));
  root.appendChild(await Featured());
  root.appendChild(Highlights());

  return root;
}

function Hero(b) {
  const el = document.createElement('section');
  el.className = 'container-x section';
  el.innerHTML = `
    <div class="max-w-2xl">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
            style="background: var(--color-primary-soft); color: var(--color-primary)">
        <span class="w-1.5 h-1.5 rounded-full" style="background: var(--color-primary)"></span>
        Live on Supabase
      </span>
      <h1 class="mt-5 text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
        ${escapeHtml(b.site_name)}
      </h1>
      <p class="mt-4 text-lg muted max-w-xl leading-relaxed">
        A simple, calm place to browse and buy. Catalog, brand, and theme
        all flow from the admin panel — change them anytime, no redeploy.
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
  wrap.className = 'container-x pb-4';
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
          No products yet. Run <code class="px-1 py-0.5 rounded"
            style="background: var(--color-bg)">supabase/seed.sql</code> to add samples.
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
