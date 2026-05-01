import { getAdminProducts, deleteProduct, getAllCategories } from '../../services/admin-products.js';
import { formatPrice } from '../../services/products.js';
import { supabase } from '../../services/supabase.js';
import { confirmDialog } from '../../components/dialog.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

export async function AdminProductsList() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8';

  let products, categories;
  try {
    [products, categories] = await Promise.all([
      getAdminProducts(),
      getAllCategories(),
    ]);
  } catch (e) {
    root.innerHTML = errorBox(e.message);
    return root;
  }
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  // We need each product's category ids — fetch the junction once.
  const { data: junctionData } = await supabase
    .from('product_categories').select('*');
  const catsByProduct = new Map();
  for (const r of (junctionData || [])) {
    if (!catsByProduct.has(r.product_id)) catsByProduct.set(r.product_id, []);
    catsByProduct.get(r.product_id).push(r.category_id);
  }

  let query = '';

  root.innerHTML = `
    <header class="mb-6 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Products</h1>
        <p class="muted text-sm mt-1" data-count></p>
      </div>
      <a href="#/admin/products/new" class="btn btn-primary">+ New product</a>
    </header>

    <div class="mb-5">
      <input data-search type="search" placeholder="Search by name…" class="input max-w-sm" />
    </div>

    <div data-list class="space-y-3"></div>
  `;

  const search = root.querySelector('[data-search]');
  const list = root.querySelector('[data-list]');
  const countEl = root.querySelector('[data-count]');

  function renderRows() {
    const filtered = query
      ? products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
      : products;

    countEl.textContent = filtered.length === products.length
      ? `${products.length} product${products.length === 1 ? '' : 's'}`
      : `${filtered.length} of ${products.length} matching`;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="text-center py-14 rounded-lg" style="border:1px dashed var(--color-border); background: var(--color-surface)">
          <p class="font-medium">No products${query ? ' match that search' : ' yet'}.</p>
          <p class="text-sm muted mt-1">${query ? 'Try a different name.' : 'Click + New product to add your first one.'}</p>
        </div>`;
      return;
    }

    list.replaceChildren(...filtered.map(productRow));
  }

  function productRow(p) {
    const card = document.createElement('div');
    card.className = 'card p-4 flex items-start gap-4';

    const cats = (catsByProduct.get(p.id) || []).map((id) => catName.get(id)).filter(Boolean);

    card.innerHTML = `
      <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-md overflow-hidden shrink-0"
           style="background: var(--color-bg)">
        ${p.image_url
          ? `<img src="${p.image_url}" alt="" class="w-full h-full object-cover" />`
          : `<div class="w-full h-full flex items-center justify-center muted text-xs">No image</div>`}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 class="font-medium">${escapeHtml(p.name)}</h3>
          <span class="font-semibold" style="color: var(--color-primary)">${formatPrice(p.price)}</span>
        </div>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span class="muted">Order: <span class="font-medium" style="color:var(--color-text)">${p.display_order ?? 0}</span></span>
          <span class="muted">· Stock:
            <span class="font-medium" style="${stockTone(p.stock)}">${p.stock}</span>
          </span>
          ${Number(p.sold_count) > 0
            ? `<span class="muted">· Sold: <span class="font-medium" style="color: var(--color-text)">${p.sold_count}</span></span>`
            : ''}
          ${(p.gallery_urls || []).length > 0
            ? `<span class="muted">· Gallery: ${p.gallery_urls.length}</span>` : ''}
          ${cats.length > 0
            ? `<span class="muted">·</span>` +
              cats.map((n) =>
                `<span class="px-2 py-0.5 rounded-full text-[11px]"
                       style="background: var(--color-primary-soft); color: var(--color-primary)">${escapeHtml(n)}</span>`
              ).join('')
            : `<span class="muted">· no category</span>`}
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-2 shrink-0">
        <a href="#/admin/products/${p.id}" class="btn btn-ghost text-xs">Edit</a>
        <button data-delete class="btn btn-ghost text-xs" style="color:#b91c1c">Delete</button>
      </div>
    `;

    card.querySelector('[data-delete]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: `Delete "${p.name}"?`,
        message: 'This permanently removes the product, its reviews and questions, and any images uploaded to Supabase Storage. External image URLs are left alone.',
        confirmText: 'Delete product',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteProduct(p);
        products = products.filter((x) => x.id !== p.id);
        renderRows();
        showToast('Product deleted', { variant: 'success' });
      } catch (err) {
        showToast(err.message || 'Failed to delete', { variant: 'error' });
      }
    });

    return card;
  }

  search.addEventListener('input', () => {
    query = search.value.trim();
    renderRows();
  });

  renderRows();
  return root;
}

function stockTone(n) {
  if (n <= 0) return 'color:#b91c1c';
  if (n < 5)  return 'color:#92400e';
  return 'color: var(--color-text)';
}

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      Failed to load: ${msg}
    </div>`;
}
