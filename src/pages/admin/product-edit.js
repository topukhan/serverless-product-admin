import {
  getAdminProduct,
  getAllCategories,
  createProduct,
  updateProduct,
} from '../../services/admin-products.js';
import { ImageUploader } from '../../components/image-uploader.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

const GALLERY_SLOTS = 3;

export async function AdminProductEdit({ id } = {}) {
  const isEdit = !!id;

  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-3xl';

  let product = {
    name: '',
    description: '',
    price: 0,
    stock: 0,
    sold: 0,
    image_url: '',
    gallery_urls: [],
    category_ids: [],
  };
  let categories = [];

  try {
    const tasks = [getAllCategories()];
    if (isEdit) tasks.unshift(getAdminProduct(id));
    const results = await Promise.all(tasks);
    if (isEdit) [product, categories] = results;
    else        [categories] = results;
  } catch (e) {
    root.innerHTML = `<div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">${escapeHtml(e.message)}</div>`;
    return root;
  }

  // Build form ----------------------------------------------------------
  const form = document.createElement('form');
  form.className = 'space-y-6';

  /* Header */
  const header = document.createElement('div');
  header.className = 'flex items-end justify-between flex-wrap gap-3';
  header.innerHTML = `
    <div>
      <a href="#/admin/products" class="text-xs muted hover:underline">← Products</a>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
        ${isEdit ? 'Edit product' : 'New product'}
      </h1>
    </div>
    <div class="flex gap-2">
      <a href="#/admin/products" class="btn btn-ghost">Cancel</a>
      <button type="submit" class="btn btn-primary" data-save>Save</button>
    </div>
  `;
  form.appendChild(header);

  /* Basic info */
  const basic = section('Basics', `
    <div>
      <label class="label" for="f-name">Name</label>
      <input id="f-name" name="name" required maxlength="120" class="input"
             value="${escapeHtml(product.name)}" placeholder="Product name" />
    </div>
    <div class="mt-4">
      <label class="label" for="f-desc">Description</label>
      <textarea id="f-desc" name="description" rows="4" maxlength="4000"
                class="input resize-y"
                placeholder="What is this product?">${escapeHtml(product.description || '')}</textarea>
    </div>
  `);
  form.appendChild(basic);

  /* Pricing, stock, sold */
  const pricing = section('Pricing & inventory', `
    <div class="grid sm:grid-cols-3 gap-4">
      <div>
        <label class="label" for="f-price">Price (৳)</label>
        <input id="f-price" name="price" type="number" min="0" step="0.01" required
               class="input" value="${Number(product.price) || 0}" />
      </div>
      <div>
        <label class="label" for="f-stock">Stock</label>
        <input id="f-stock" name="stock" type="number" min="0" step="1" required
               class="input" value="${Number(product.stock) || 0}" />
      </div>
      <div>
        <label class="label" for="f-sold">Sold</label>
        <input id="f-sold" name="sold" type="number" min="0" step="1"
               class="input" value="${Number(product.sold) || 0}" />
      </div>
    </div>
    <p class="text-xs muted mt-2">
      Visibility of stock numbers and the sold count on the public site
      is controlled in <a href="#/admin/site-settings" class="underline">Site settings</a>.
    </p>
  `);
  form.appendChild(pricing);

  /* Images */
  const thumbUploader   = ImageUploader({ initialUrl: product.image_url || '', label: 'Thumbnail (main image)' });
  const gallerySlots    = [];
  for (let i = 0; i < GALLERY_SLOTS; i++) {
    const u = ImageUploader({
      initialUrl: product.gallery_urls?.[i] || '',
      label: `Gallery image ${i + 1}`,
      size: 'sm',
    });
    gallerySlots.push(u);
  }

  const images = section('Images', '');
  const imagesBody = images.querySelector('[data-body]');
  imagesBody.appendChild(thumbUploader.el);
  const galleryWrap = document.createElement('div');
  galleryWrap.className = 'mt-6 pt-6 border-t';
  galleryWrap.style.borderColor = 'var(--color-border)';
  galleryWrap.innerHTML = `
    <div class="flex items-baseline justify-between mb-3">
      <div class="label mb-0">Gallery (up to ${GALLERY_SLOTS})</div>
      <span class="text-xs muted">Optional. Shown as thumbnails under the main image.</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4" data-gallery-grid></div>
  `;
  const grid = galleryWrap.querySelector('[data-gallery-grid]');
  gallerySlots.forEach((u) => grid.appendChild(u.el));
  imagesBody.appendChild(galleryWrap);
  form.appendChild(images);

  /* Categories */
  const cats = section('Categories', categoriesMarkup(categories, product.category_ids));
  const catCheckboxes = cats.querySelectorAll('input[name="category"]');
  form.appendChild(cats);

  /* Bottom actions */
  const footer = document.createElement('div');
  footer.className = 'flex justify-end gap-2 pt-2';
  footer.innerHTML = `
    <a href="#/admin/products" class="btn btn-ghost">Cancel</a>
    <button type="submit" class="btn btn-primary" data-save>Save</button>
  `;
  form.appendChild(footer);

  /* Submit */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) return showToast('Name is required.', { variant: 'error' });

    const price = Number(fd.get('price'));
    const stock = Math.max(0, parseInt(fd.get('stock'), 10) || 0);
    const sold  = Math.max(0, parseInt(fd.get('sold'),  10) || 0);
    const description = String(fd.get('description') || '').trim();

    const image_url = thumbUploader.getValue() || null;
    const gallery_urls = gallerySlots.map((u) => u.getValue()).filter(Boolean);

    const selectedCats = Array.from(catCheckboxes)
      .filter((c) => c.checked)
      .map((c) => c.value);

    const payload = { name, description, price, stock, sold, image_url, gallery_urls };

    const saveBtns = form.querySelectorAll('[data-save]');
    saveBtns.forEach((b) => { b.disabled = true; b.textContent = 'Saving…'; });

    try {
      if (isEdit) {
        await updateProduct(id, payload, selectedCats);
        showToast('Product updated', { variant: 'success' });
      } else {
        await createProduct(payload, selectedCats);
        showToast('Product created', { variant: 'success' });
      }
      location.hash = '#/admin/products';
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
    } finally {
      saveBtns.forEach((b) => { b.disabled = false; b.textContent = 'Save'; });
    }
  });

  root.appendChild(form);
  return root;
}

/* ---------- helpers ---------- */

function section(title, innerHtml) {
  const sec = document.createElement('div');
  sec.className = 'card p-5 sm:p-6';
  sec.innerHTML = `
    <h2 class="font-semibold">${title}</h2>
    <div class="mt-4" data-body>${innerHtml}</div>
  `;
  return sec;
}

function categoriesMarkup(categories, selected) {
  if (categories.length === 0) {
    return `
      <p class="text-sm muted">
        No categories yet. Create some in
        <a class="underline" href="#/admin/categories">Categories</a>, then come back.
      </p>`;
  }
  const sel = new Set(selected);
  return `
    <div class="grid sm:grid-cols-2 gap-2">
      ${categories.map((c) => `
        <label class="flex items-center gap-2.5 p-2 rounded-md cursor-pointer hover:bg-[color:var(--color-primary-soft)]">
          <input type="checkbox" name="category" value="${c.id}" ${sel.has(c.id) ? 'checked' : ''}
                 class="w-4 h-4" style="accent-color: var(--color-primary)" />
          <span class="text-sm">${escapeHtml(c.name)}</span>
        </label>
      `).join('')}
    </div>
  `;
}
