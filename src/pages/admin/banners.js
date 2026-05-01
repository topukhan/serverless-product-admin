import {
  getAllBannerSlides, saveBannerSlide, deleteBannerSlide, toggleBannerSlide,
  uploadBannerImage,
} from '../../services/banners.js';
import { getAllCategories, getAdminProducts } from '../../services/admin-products.js';
import { ImageUploader } from '../../components/image-uploader.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/dialog.js';
import { escapeHtml } from '../../lib/dom.js';

export async function AdminBannersPage() {
  const root = document.createElement('div');
  root.className = 'container-x py-8';

  root.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-6">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight">Banner slides</h1>
        <p class="text-sm muted mt-1">Manage the home page carousel. Slides display in sort order.</p>
      </div>
      <button data-add class="btn btn-primary text-sm shrink-0 whitespace-nowrap">+ Add slide</button>
    </div>
    <div data-form-area></div>
    <div data-list class="flex flex-col gap-3"></div>
  `;

  const listEl = root.querySelector('[data-list]');
  const formArea = root.querySelector('[data-form-area]');

  async function reload() {
    let slides;
    try { slides = await getAllBannerSlides(); }
    catch (e) { showToast(e.message, { variant: 'error' }); return; }
    listEl.replaceChildren(...slides.map((s) => slideRow(s)));
  }

  function slideRow(slide) {
    const alignLabel = { left: 'Left', center: 'Center', right: 'Right' }[slide.text_align] || 'Left';
    const ctaLabel = slide.cta_type === 'product' ? 'Product' : slide.cta_type === 'category' ? 'Category' : 'Link';

    const row = document.createElement('div');
    row.className = 'card p-4 flex flex-col gap-3';

    // Top: thumbnail + info
    const top = document.createElement('div');
    top.className = 'flex items-start gap-3';

    const thumb = document.createElement('div');
    thumb.className = 'w-20 h-14 rounded-md shrink-0 overflow-hidden';
    thumb.style.cssText = 'background:var(--color-bg); border:1px solid var(--color-border);';
    if (slide.image_url) {
      thumb.innerHTML = `<img src="${escapeHtml(slide.image_url)}" class="w-full h-full object-cover" alt="" />`;
    } else {
      thumb.style.background = 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)';
    }
    top.appendChild(thumb);

    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';
    info.innerHTML = `
      <div class="font-medium truncate">${escapeHtml(slide.title)}</div>
      ${slide.subtitle ? `<div class="text-sm muted truncate mt-0.5">${escapeHtml(slide.subtitle)}</div>` : ''}
      <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium"
              style="background:${slide.enabled ? 'var(--color-primary-soft)' : 'var(--color-bg)'}; color:${slide.enabled ? 'var(--color-primary)' : 'var(--color-muted)'}">
          ${slide.enabled ? 'Visible' : 'Hidden'}
        </span>
        <span class="text-xs muted">· ${alignLabel} · ${ctaLabel} · #${slide.sort_order}</span>
      </div>
    `;
    top.appendChild(info);
    row.appendChild(top);

    // Bottom: action buttons (full width, left-aligned)
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-2 border-t pt-3';
    actions.style.borderColor = 'var(--color-border)';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-ghost text-xs px-3 py-1.5';
    toggleBtn.textContent = slide.enabled ? 'Hide' : 'Show';
    toggleBtn.addEventListener('click', async () => {
      try { await toggleBannerSlide(slide.id, !slide.enabled); showToast(slide.enabled ? 'Slide hidden' : 'Slide visible'); reload(); }
      catch (e) { showToast(e.message, { variant: 'error' }); }
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost text-xs px-3 py-1.5';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => showForm(slide));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost text-xs px-3 py-1.5 ml-auto';
    delBtn.style.color = '#b91c1c';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Delete slide?', message: 'This cannot be undone.', confirmText: 'Delete' });
      if (!ok) return;
      try { await deleteBannerSlide(slide.id); showToast('Slide deleted'); reload(); }
      catch (e) { showToast(e.message, { variant: 'error' }); }
    });

    actions.append(toggleBtn, editBtn, delBtn);
    row.appendChild(actions);
    return row;
  }

  async function showForm(slide = null) {
    formArea.innerHTML = '';

    // Pre-load products + categories for CTA selectors
    let products = [], categories = [];
    try { [products, categories] = await Promise.all([getAdminProducts(), getAllCategories()]); }
    catch { /* non-fatal, selects just empty */ }

    const wrap = document.createElement('div');
    wrap.className = 'card p-6 mb-4';

    // Title
    const titleEl = document.createElement('h2');
    titleEl.className = 'font-semibold mb-5';
    titleEl.textContent = slide ? 'Edit slide' : 'New slide';
    wrap.appendChild(titleEl);

    const grid = document.createElement('div');
    grid.className = 'grid gap-4 sm:grid-cols-2';

    // --- Image uploader (full width) ---
    const imgRow = document.createElement('div');
    imgRow.className = 'sm:col-span-2';
    const imgLabel = document.createElement('div');
    imgLabel.className = 'label mb-2';
    imgLabel.textContent = 'Banner image';
    const imgUploader = ImageUploader({
      initialUrl: slide?.image_url || '',
      label: 'Banner image',
      upload: uploadBannerImage,
    });
    // Override aspect ratio for banner preview
    imgUploader.el.querySelector('div[style*="aspect-ratio"]')?.style?.setProperty('aspect-ratio', '3/1');
    imgRow.appendChild(imgUploader.el);
    // Remove duplicate label from uploader
    imgRow.querySelector('.label')?.remove();
    imgRow.insertBefore(imgLabel, imgRow.firstChild);
    grid.appendChild(imgRow);

    // --- Title ---
    const titleRow = document.createElement('div');
    titleRow.className = 'sm:col-span-2';
    titleRow.innerHTML = `<label class="label">Title <span style="color:#b91c1c">*</span></label>
      <input name="title" class="input" required placeholder="Summer Collection"
             value="${escapeHtml(slide?.title || '')}" />`;
    grid.appendChild(titleRow);

    // --- Subtitle ---
    const subtitleRow = document.createElement('div');
    subtitleRow.className = 'sm:col-span-2';
    subtitleRow.innerHTML = `<label class="label">Subtitle</label>
      <input name="subtitle" class="input" placeholder="Discover our latest arrivals"
             value="${escapeHtml(slide?.subtitle || '')}" />`;
    grid.appendChild(subtitleRow);

    // --- Text alignment ---
    const alignRow = document.createElement('div');
    alignRow.innerHTML = `<label class="label">Text & button alignment</label>
      <div class="flex gap-2">
        ${['left','center','right'].map((a) => `
          <label class="flex-1 flex items-center justify-center gap-1.5 text-sm cursor-pointer rounded-md py-2
                        border transition hover:border-[color:var(--color-primary)]"
                 style="border-color:var(--color-border);">
            <input type="radio" name="text_align" value="${a}" class="w-3.5 h-3.5"
                   ${(slide?.text_align || 'left') === a ? 'checked' : ''} />
            ${a.charAt(0).toUpperCase() + a.slice(1)}
          </label>`).join('')}
      </div>`;
    grid.appendChild(alignRow);

    // --- Sort order + Enabled ---
    const metaRow = document.createElement('div');
    metaRow.innerHTML = `<label class="label">Sort order</label>
      <input name="sort_order" class="input" type="number" value="${slide?.sort_order ?? 0}" />`;
    grid.appendChild(metaRow);

    const enabledRow = document.createElement('div');
    enabledRow.className = 'flex items-center gap-2 pt-5';
    enabledRow.innerHTML = `<input name="enabled" id="slide-enabled" type="checkbox" class="w-4 h-4 rounded"
                                   ${slide?.enabled !== false ? 'checked' : ''} />
      <label for="slide-enabled" class="text-sm">Visible on site</label>`;
    grid.appendChild(enabledRow);

    // --- CTA button text ---
    const ctaTextRow = document.createElement('div');
    ctaTextRow.innerHTML = `<label class="label">CTA button text</label>
      <input name="cta_text" class="input" placeholder="Shop now"
             value="${escapeHtml(slide?.cta_text || '')}" />
      <p class="text-xs muted mt-1">Leave blank to hide the button.</p>`;
    grid.appendChild(ctaTextRow);

    // --- CTA destination type ---
    const ctaTypeRow = document.createElement('div');
    const currentType = slide?.cta_type || 'url';
    ctaTypeRow.innerHTML = `<label class="label">Button goes to</label>
      <select name="cta_type" class="input">
        <option value="url"      ${currentType === 'url'      ? 'selected' : ''}>Custom link (URL, Facebook, etc.)</option>
        <option value="product"  ${currentType === 'product'  ? 'selected' : ''}>A specific product page</option>
        <option value="category" ${currentType === 'category' ? 'selected' : ''}>Product list filtered by category</option>
      </select>`;
    grid.appendChild(ctaTypeRow);

    // --- Conditional CTA fields (full width) ---
    const ctaFieldsRow = document.createElement('div');
    ctaFieldsRow.className = 'sm:col-span-2';

    const urlField = document.createElement('div');
    urlField.innerHTML = `<label class="label">Link URL</label>
      <input name="cta_url" class="input" placeholder="https://… or #/products"
             value="${escapeHtml(slide?.cta_url || '')}" />`;

    const productField = document.createElement('div');
    productField.innerHTML = `<label class="label">Select product</label>
      <select name="cta_product_id" class="input">
        <option value="">— choose a product —</option>
        ${products.map((p) => `<option value="${p.id}" ${slide?.cta_product_id === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>`;

    const categoryField = document.createElement('div');
    categoryField.innerHTML = `<label class="label">Select category</label>
      <select name="cta_category_id" class="input">
        <option value="">— choose a category —</option>
        ${categories.map((c) => `<option value="${c.id}" ${slide?.cta_category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>`;

    function showCtaField(type) {
      ctaFieldsRow.replaceChildren(
        type === 'url'      ? urlField      :
        type === 'product'  ? productField  : categoryField
      );
    }
    showCtaField(currentType);
    ctaTypeRow.querySelector('select').addEventListener('change', (e) => showCtaField(e.target.value));
    grid.appendChild(ctaFieldsRow);

    // --- Actions (inside card, with top border) ---
    const actionsDivider = document.createElement('div');
    actionsDivider.className = 'border-t mt-6 pt-5 flex gap-3';
    actionsDivider.style.borderColor = 'var(--color-border)';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'btn btn-primary text-sm';
    saveBtn.textContent = 'Save slide';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost text-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { formArea.innerHTML = ''; });
    actionsDivider.append(saveBtn, cancelBtn);

    wrap.appendChild(grid);
    wrap.appendChild(actionsDivider);

    const form = document.createElement('form');
    form.className = 'mb-8';
    form.appendChild(wrap);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const ctaType = fd.get('cta_type');
      const payload = {
        ...(slide ? { id: slide.id } : {}),
        title:           fd.get('title').trim(),
        subtitle:        fd.get('subtitle').trim() || null,
        image_url:       imgUploader.getValue() || null,
        text_align:      fd.get('text_align') || 'left',
        cta_text:        fd.get('cta_text').trim() || null,
        cta_type:        ctaType,
        cta_url:         ctaType === 'url'      ? (fd.get('cta_url').trim() || null) : null,
        cta_product_id:  ctaType === 'product'  ? (fd.get('cta_product_id') || null) : null,
        cta_category_id: ctaType === 'category' ? (fd.get('cta_category_id') || null) : null,
        sort_order:      parseInt(fd.get('sort_order'), 10) || 0,
        enabled:         fd.get('enabled') === 'on',
      };
      try {
        await saveBannerSlide(payload);
        showToast(slide ? 'Slide updated' : 'Slide added');
        formArea.innerHTML = '';
        reload();
      } catch (err) { showToast(err.message, { variant: 'error' }); }
    });

    formArea.appendChild(form);
    wrap.querySelector('input[name="title"]').focus();
  }

  root.querySelector('[data-add]').addEventListener('click', () => showForm(null));
  await reload();
  return root;
}
