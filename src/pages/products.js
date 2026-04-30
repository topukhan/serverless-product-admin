import { getCatalog } from '../services/products.js';
import { ProductCard } from '../components/product-card.js';
import { escapeHtml } from '../lib/dom.js';

export async function ProductsPage() {
  const el = document.createElement('section');
  el.className = 'container-x py-10';

  el.innerHTML = `
    <header class="mb-8 max-w-2xl">
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">All products</h1>
      <p class="mt-2 muted" data-count>Loading…</p>
    </header>
    <div data-filters class="flex flex-wrap gap-2 mb-6"></div>
    <div data-grid class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"></div>
  `;

  const filtersEl = el.querySelector('[data-filters]');
  const gridEl    = el.querySelector('[data-grid]');
  const countEl   = el.querySelector('[data-count]');

  let catalog;
  try {
    catalog = await getCatalog();
  } catch (e) {
    gridEl.innerHTML = errorState(e.message);
    countEl.textContent = '';
    return el;
  }

  const { products, categories, catsByProduct, reviewStats } = catalog;
  let selected = null;

  function categoryCount(catId) {
    if (catId === null) return products.length;
    return products.filter((p) =>
      (catsByProduct.get(p.id) || []).includes(catId)
    ).length;
  }

  function renderFilters() {
    filtersEl.replaceChildren(
      filterChip('All', null, categoryCount(null)),
      ...categories.map((c) => filterChip(c.name, c.id, categoryCount(c.id)))
    );
  }

  function filterChip(label, id, count) {
    const active = selected === id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm transition';
    b.style.border = '1px solid ' + (active ? 'transparent' : 'var(--color-border)');
    b.style.background = active ? 'var(--color-primary)' : 'var(--color-surface)';
    b.style.color = active ? '#fff' : 'var(--color-text)';
    b.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <span class="text-xs" style="opacity:${active ? '0.8' : '0.55'}">${count}</span>
    `;
    b.addEventListener('click', () => {
      selected = id;
      renderFilters();
      renderGrid();
    });
    return b;
  }

  function renderGrid() {
    const filtered =
      selected === null
        ? products
        : products.filter((p) => (catsByProduct.get(p.id) || []).includes(selected));

    countEl.textContent =
      filtered.length === 0
        ? 'No products match this filter.'
        : `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      gridEl.className = '';
      gridEl.innerHTML = emptyState();
      return;
    }
    gridEl.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4';
    gridEl.replaceChildren(
      ...filtered.map((p) => ProductCard(p, { stats: reviewStats.get(p.id) }))
    );
  }

  renderFilters();
  renderGrid();
  return el;
}

function emptyState() {
  return `
    <div class="text-center py-16 rounded-lg"
         style="border:1px dashed var(--color-border); background: var(--color-surface)">
      <p class="font-medium">Nothing here yet.</p>
      <p class="text-sm muted mt-1">
        Try a different filter, or run
        <code class="px-1 py-0.5 rounded" style="background: var(--color-bg)">supabase/seed.sql</code>.
      </p>
    </div>
  `;
}

function errorState(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      <strong>Failed to load products.</strong>
      <div class="text-sm mt-1">${escapeHtml(msg)}</div>
    </div>
  `;
}
