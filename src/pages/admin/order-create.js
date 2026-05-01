import { supabase } from '../../services/supabase.js';
import {
  createAdminOrder,
  updateOrderPending,
  getAdminOrder,
  searchProductsForOrder,
} from '../../services/admin-orders.js';
import { searchCustomers } from '../../services/admin-customers.js';
import { formatPrice } from '../../services/products.js';
import { getBranding } from '../../services/branding.js';
import { showToast } from '../../components/toast.js';
import { navigate } from '../../services/router.js';
import { escapeHtml } from '../../lib/dom.js';

export function AdminOrderCreatePage() { return OrderFormPage({ mode: 'create' }); }
export function AdminOrderEditPage(params) { return OrderFormPage({ mode: 'edit', orderId: params.id }); }

async function OrderFormPage({ mode, orderId = null }) {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-4xl';

  // Edit mode: hydrate from the existing order. We also fetch image_urls for
  // the items we already have so the selected list matches the picker style.
  let existing = null;
  let initialItems = [];
  if (mode === 'edit') {
    try {
      existing = await getAdminOrder(orderId);
    } catch (err) {
      root.innerHTML = errorBox(err.message);
      return root;
    }
    if (existing.status !== 'pending') {
      root.innerHTML = `
        <a href="#/admin/orders/${existing.id}" class="text-sm muted hover:underline">← Back to order</a>
        <div class="card p-6 mt-3">
          <p class="font-medium">This order can no longer be edited.</p>
          <p class="muted text-sm mt-1">Editing is only allowed while an order is pending.</p>
        </div>`;
      return root;
    }
    const ids = (existing.items || []).map((it) => it.product_id).filter(Boolean);
    let imgMap = new Map();
    if (ids.length > 0) {
      const { data } = await supabase.from('products')
        .select('id, image_url, stock').in('id', ids);
      imgMap = new Map((data || []).map((p) => [p.id, p]));
    }
    initialItems = (existing.items || []).map((it) => ({
      id: it.product_id,
      name: it.product_name,
      price: Number(it.product_price),
      qty: it.quantity,
      image_url: imgMap.get(it.product_id)?.image_url || null,
      stock: imgMap.get(it.product_id)?.stock ?? null,
    }));
  }

  const brand = getBranding();
  const zoneFee = {
    inside_dhaka:  Number(brand.delivery_charge_inside_dhaka  || 0),
    outside_dhaka: Number(brand.delivery_charge_outside_dhaka || 0),
  };

  // selection: Map<productId, { id, name, price, image_url, stock, qty }>
  const sel = new Map();
  for (const it of initialItems) sel.set(it.id, it);

  const isEdit = mode === 'edit';
  const heading = isEdit ? `Edit ${existing.order_number}` : 'New order';
  const subhead = isEdit
    ? 'Update items, customer details or charges. Allowed while pending.'
    : 'Create an order on behalf of a customer.';
  const submitLabel = isEdit ? 'Save changes' : 'Create order';
  const backHref   = isEdit ? `#/admin/orders/${orderId}` : '#/admin/orders';

  root.innerHTML = `
    <header class="mb-6">
      <a href="${backHref}" class="text-sm muted hover:underline">← Back</a>
      <h1 class="mt-1 text-2xl sm:text-3xl font-bold tracking-tight">${escapeHtml(heading)}</h1>
      <p class="muted text-sm mt-1">${escapeHtml(subhead)}</p>
    </header>

    <form data-form class="grid lg:grid-cols-[1fr_320px] gap-6 items-start" novalidate>
      <div class="space-y-5">
        <div class="card p-5 sm:p-6 space-y-4">
          <h2 class="font-semibold">Customer</h2>

          <div>
            <label class="label">Find existing customer</label>
            <div class="relative">
              <input data-cust-search class="input pr-10"
                     placeholder="Search by name, phone or email…" />
              <button type="button" data-cust-clear aria-label="Clear customer search"
                      class="hidden absolute inset-y-0 right-2 flex items-center muted hover:opacity-70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div data-cust-results
                   class="hidden absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md shadow-md"
                   style="background:var(--color-surface);border:1px solid var(--color-border)"></div>
            </div>
            <p data-cust-selected class="text-xs muted mt-1 hidden">Selected customer auto-filled below. Search again or clear to switch.</p>
          </div>

          <div>
            <label class="label">Name <span style="color:#b91c1c">*</span></label>
            <input data-name class="input" maxlength="80" required
                   value="${escapeHtml(existing?.customer_name || '')}" />
          </div>
          <div>
            <label class="label">Phone <span style="color:#b91c1c">*</span></label>
            <input data-phone class="input" maxlength="15" required inputmode="numeric"
                   placeholder="01XXXXXXXXX"
                   value="${escapeHtml(existing?.customer_phone || '')}" />
          </div>
          <div>
            <label class="label">Address <span style="color:#b91c1c">*</span></label>
            <textarea data-address class="input" rows="2" required>${escapeHtml(existing?.customer_address || '')}</textarea>
          </div>
          <div>
            <label class="label">Delivery zone</label>
            <select data-zone class="input">
              <option value="">— None —</option>
              <option value="inside_dhaka"  ${existing?.delivery_zone === 'inside_dhaka'  ? 'selected' : ''}>Inside Dhaka (৳${zoneFee.inside_dhaka})</option>
              <option value="outside_dhaka" ${existing?.delivery_zone === 'outside_dhaka' ? 'selected' : ''}>Outside Dhaka (৳${zoneFee.outside_dhaka})</option>
            </select>
          </div>
          <div>
            <label class="label">Customer note</label>
            <textarea data-cnote class="input" rows="2" maxlength="500">${escapeHtml(existing?.customer_note || '')}</textarea>
          </div>
          <div>
            <label class="label">Admin note</label>
            <textarea data-anote class="input" rows="2" maxlength="500"
                      placeholder="Internal note (visible to admin only)">${escapeHtml(existing?.admin_note || '')}</textarea>
          </div>
        </div>

        <div class="card p-5 sm:p-6">
          <h2 class="font-semibold mb-3">Items</h2>
          <div class="relative">
            <input data-search class="input" placeholder="Click to browse, or type to search…" />
            <div data-results class="hidden absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md shadow-md"
                 style="background:var(--color-surface);border:1px solid var(--color-border)"></div>
          </div>
          <div data-items class="mt-4 divide-y" style="border-color:var(--color-border)"></div>
        </div>
      </div>

      <aside class="card p-5 sm:p-6 lg:sticky lg:top-20 space-y-3">
        <h2 class="font-semibold">Totals</h2>
        <dl class="text-sm space-y-2">
          <div class="flex justify-between"><dt class="muted">Subtotal</dt><dd data-subtotal>৳0</dd></div>
          <div class="flex justify-between items-center gap-3">
            <dt class="muted">Discount</dt>
            <dd><input data-discount type="number" min="0" step="0.01"
                       value="${Number(existing?.discount_amount || 0)}"
                       class="input text-right" style="width:7rem" /></dd>
          </div>
          <div class="flex justify-between items-center gap-3">
            <dt class="muted">Charge</dt>
            <dd><input data-charge type="number" min="0" step="0.01"
                       value="${Number(existing?.charge_amount || 0)}"
                       class="input text-right" style="width:7rem" /></dd>
          </div>
          <div class="flex justify-between pt-2 border-t" style="border-color:var(--color-border)">
            <dt class="font-semibold">Total</dt>
            <dd class="font-semibold" style="color:var(--color-primary)" data-total>৳0</dd>
          </div>
        </dl>
        <button data-submit type="submit" class="btn btn-primary w-full mt-2">${escapeHtml(submitLabel)}</button>
      </aside>
    </form>
  `;

  const form     = root.querySelector('[data-form]');
  const nameEl   = root.querySelector('[data-name]');
  const phoneEl  = root.querySelector('[data-phone]');
  const addrEl   = root.querySelector('[data-address]');
  const zoneEl   = root.querySelector('[data-zone]');
  const cnoteEl  = root.querySelector('[data-cnote]');
  const anoteEl  = root.querySelector('[data-anote]');
  const searchEl = root.querySelector('[data-search]');
  const resultsEl= root.querySelector('[data-results]');
  const itemsEl  = root.querySelector('[data-items]');
  const subEl    = root.querySelector('[data-subtotal]');
  const totalEl  = root.querySelector('[data-total]');
  const discEl   = root.querySelector('[data-discount]');
  const chargeEl = root.querySelector('[data-charge]');
  const submitBtn= root.querySelector('[data-submit]');

  let chargeOverridden = isEdit; // don't auto-overwrite charges when editing.
  let selectedCustomerId = existing?.customer_id || null;

  phoneEl.addEventListener('input', () => {
    const cleaned = phoneEl.value.replace(/\D/g, '');
    if (cleaned !== phoneEl.value) phoneEl.value = cleaned;
  });

  /* ---------- Customer picker ---------- */
  const custSearchEl  = root.querySelector('[data-cust-search]');
  const custResultsEl = root.querySelector('[data-cust-results]');
  const custLabelEl   = root.querySelector('[data-cust-selected]');
  const custClearEl   = root.querySelector('[data-cust-clear]');

  let custTimer = null;
  let custLastQuery = null;

  function paintCustClear() {
    if (custSearchEl.value || selectedCustomerId) custClearEl.classList.remove('hidden');
    else custClearEl.classList.add('hidden');
  }
  paintCustClear();

  function clearCustomerSelection({ wipeFields = true } = {}) {
    selectedCustomerId = null;
    custSearchEl.value = '';
    custResultsEl.innerHTML = '';
    custResultsEl.classList.add('hidden');
    custLabelEl.classList.add('hidden');
    if (wipeFields) {
      nameEl.value  = '';
      phoneEl.value = '';
      addrEl.value  = '';
      zoneEl.value  = '';
      if (!chargeOverridden) { chargeEl.value = '0'; paintTotals(); }
    }
    paintCustClear();
    custSearchEl.focus();
  }

  custClearEl.addEventListener('click', () => clearCustomerSelection());

  async function runCustSearch(term) {
    custLastQuery = term;
    try {
      const rows = await searchCustomers(term, 12);
      if (custLastQuery !== term) return;
      paintCustResults(rows);
    } catch (err) {
      custResultsEl.innerHTML = `<div class="px-3 py-2 text-sm" style="color:#b91c1c">${escapeHtml(err.message)}</div>`;
      custResultsEl.classList.remove('hidden');
    }
  }

  function paintCustResults(rows) {
    if (!rows.length) {
      custResultsEl.innerHTML = `<div class="px-3 py-3 text-sm muted">No customers found.</div>`;
      custResultsEl.classList.remove('hidden');
      return;
    }
    custResultsEl.innerHTML = rows.map((c) => `
      <button type="button" data-cust-pick="${escapeHtml(c.id)}"
              class="w-full text-left px-3 py-2 hover:bg-[var(--color-primary-soft)] flex flex-col gap-0.5 text-sm">
        <span class="font-medium line-clamp-1">${escapeHtml(c.full_name || '— no name —')}</span>
        <span class="text-xs muted line-clamp-1">${escapeHtml(c.phone || '')}${c.phone && c.email ? ' · ' : ''}${escapeHtml(c.email || '')}</span>
        ${c.address ? `<span class="text-xs muted line-clamp-1">${escapeHtml(c.address)}</span>` : ''}
      </button>
    `).join('');
    custResultsEl._rows = new Map(rows.map((c) => [c.id, c]));
    custResultsEl.classList.remove('hidden');
  }

  custSearchEl.addEventListener('focus', () => runCustSearch(custSearchEl.value || ''));
  custSearchEl.addEventListener('input', () => {
    clearTimeout(custTimer);
    const term = custSearchEl.value;
    paintCustClear();
    custTimer = setTimeout(() => runCustSearch(term), 220);
  });
  custSearchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') custResultsEl.classList.add('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!custSearchEl.parentElement.contains(e.target)) custResultsEl.classList.add('hidden');
  });
  custResultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cust-pick]');
    if (!btn) return;
    const c = custResultsEl._rows?.get(btn.dataset.custPick);
    if (!c) return;
    selectedCustomerId = c.id;
    nameEl.value  = c.full_name || '';
    phoneEl.value = (c.phone || '').replace(/\D/g, '');
    addrEl.value  = c.address || '';
    if (c.delivery_zone) {
      zoneEl.value = c.delivery_zone;
      if (!chargeOverridden) {
        chargeEl.value = String(zoneFee[c.delivery_zone] || 0);
        paintTotals();
      }
    }
    custSearchEl.value = `${c.full_name || ''} (${c.phone || c.email || ''})`.trim();
    custLabelEl.classList.remove('hidden');
    custResultsEl.classList.add('hidden');
    paintCustClear();
  });

  /* ---------- Product picker ---------- */

  let lastQuery = null;
  let searchTimer = null;

  async function runSearch(term) {
    lastQuery = term;
    try {
      const rows = await searchProductsForOrder(term, 10);
      // Avoid clobbering with stale results.
      if (lastQuery !== term) return;
      paintResults(rows);
    } catch (err) {
      resultsEl.innerHTML = `<div class="px-3 py-2 text-sm" style="color:#b91c1c">${escapeHtml(err.message)}</div>`;
      resultsEl.classList.remove('hidden');
    }
  }

  function paintResults(rows) {
    const filtered = rows.filter((p) => !sel.has(p.id));
    if (filtered.length === 0) {
      resultsEl.innerHTML = `<div class="px-3 py-3 text-sm muted">No products found.</div>`;
      resultsEl.classList.remove('hidden');
      return;
    }
    resultsEl.innerHTML = filtered.map((p) => `
      <button type="button" data-pick="${p.id}"
              class="w-full text-left px-3 py-2 hover:bg-[var(--color-primary-soft)] flex items-center gap-3 text-sm">
        ${thumb(p.image_url)}
        <span class="flex-1 min-w-0">
          <span class="block line-clamp-1">${escapeHtml(p.name)}</span>
          <span class="block text-xs muted">${formatPrice(p.price)} · stock ${p.stock}</span>
        </span>
      </button>
    `).join('');
    // Stash row data so the click handler can read price/name/image without a refetch.
    resultsEl._rows = new Map(filtered.map((p) => [p.id, p]));
    resultsEl.classList.remove('hidden');
  }

  searchEl.addEventListener('focus', () => {
    if (resultsEl._rows && resultsEl.classList.contains('hidden') && searchEl.value.trim() === '') {
      resultsEl.classList.remove('hidden');
    } else {
      runSearch('');
    }
  });
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const term = searchEl.value;
    searchTimer = setTimeout(() => runSearch(term), 220);
  });
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) resultsEl.classList.add('hidden');
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') resultsEl.classList.add('hidden');
  });

  resultsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick]');
    if (!btn) return;
    const p = resultsEl._rows?.get(btn.dataset.pick);
    if (!p) return;
    sel.set(p.id, {
      id: p.id, name: p.name, price: Number(p.price),
      image_url: p.image_url, stock: p.stock, qty: 1,
    });
    searchEl.value = '';
    resultsEl.classList.add('hidden');
    paintItems();
    paintTotals();
  });

  /* ---------- Selected items ---------- */

  function paintItems() {
    if (sel.size === 0) {
      itemsEl.innerHTML = `<p class="text-sm muted py-3">No items yet. Click the box above to browse.</p>`;
      return;
    }
    itemsEl.innerHTML = '';
    for (const [pid, it] of sel) {
      const row = document.createElement('div');
      row.className = 'py-2.5 flex items-center gap-3';
      row.innerHTML = `
        ${thumb(it.image_url)}
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium line-clamp-1">${escapeHtml(it.name)}</div>
          <div class="text-xs muted">
            ${formatPrice(it.price)}${it.stock != null ? ` · stock ${it.stock}` : ''}
          </div>
        </div>
        <input data-qty type="number" min="1" value="${it.qty}" class="input text-right" style="width:5rem" />
        <div class="text-sm font-medium" style="width:5.5rem;text-align:right" data-line>${formatPrice(it.price * it.qty)}</div>
        <button data-rm type="button" class="muted hover:text-red-600" aria-label="Remove">✕</button>
      `;
      row.querySelector('[data-qty]').addEventListener('input', (e) => {
        const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
        it.qty = v;
        row.querySelector('[data-line]').textContent = formatPrice(it.price * v);
        paintTotals();
      });
      row.querySelector('[data-rm]').addEventListener('click', () => {
        sel.delete(pid);
        paintItems(); paintTotals();
      });
      itemsEl.appendChild(row);
    }
  }

  function subtotal() {
    let s = 0;
    for (const [, it] of sel) s += it.price * it.qty;
    return s;
  }
  function paintTotals() {
    const s = subtotal();
    const d = Math.max(0, Number(discEl.value) || 0);
    const c = Math.max(0, Number(chargeEl.value) || 0);
    subEl.textContent = formatPrice(s);
    totalEl.textContent = formatPrice(Math.max(0, s + c - d));
  }

  zoneEl.addEventListener('change', () => {
    if (!chargeOverridden && zoneEl.value) {
      chargeEl.value = String(zoneFee[zoneEl.value] || 0);
      paintTotals();
    }
  });
  chargeEl.addEventListener('input', () => { chargeOverridden = true; paintTotals(); });
  discEl.addEventListener('input', paintTotals);

  paintItems();
  paintTotals();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (nameEl.value.trim().length < 2)   return showToast('Name is required.', { variant: 'error' });
    if (phoneEl.value.replace(/\D/g, '').length < 7)
      return showToast('Phone is required.', { variant: 'error' });
    if (addrEl.value.trim().length < 5)   return showToast('Address is required.', { variant: 'error' });
    if (sel.size === 0)                   return showToast('Add at least one item.', { variant: 'error' });

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Saving…' : 'Creating…';
    try {
      const payload = {
        customer_id: selectedCustomerId || null,
        customer_name: nameEl.value.trim(),
        customer_phone: phoneEl.value.trim(),
        customer_address: addrEl.value.trim(),
        customer_note: cnoteEl.value.trim() || null,
        admin_note: anoteEl.value.trim() || null,
        delivery_zone: zoneEl.value || null,
        discount_amount: Number(discEl.value) || 0,
        charge_amount: Number(chargeEl.value) || 0,
        items: Array.from(sel.values()).map((it) => ({ product_id: it.id, qty: it.qty })),
      };
      if (isEdit) {
        await updateOrderPending({ orderId, payload });
        showToast('Order updated', { variant: 'success' });
        navigate(`/admin/orders/${orderId}`);
      } else {
        const res = await createAdminOrder(payload);
        showToast('Order created', { variant: 'success' });
        navigate(`/admin/orders/${res.order_id}`);
      }
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });

  return root;
}

function thumb(url) {
  if (url) {
    return `<img src="${escapeHtml(url)}" alt=""
                 class="w-10 h-10 rounded object-cover shrink-0"
                 style="border:1px solid var(--color-border);background:var(--color-surface)" />`;
  }
  return `<div class="w-10 h-10 rounded shrink-0"
              style="border:1px solid var(--color-border);background:var(--color-surface)"></div>`;
}

function errorBox(msg) {
  return `<div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
    Failed to load: ${escapeHtml(msg)}
  </div>`;
}
