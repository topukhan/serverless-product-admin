import {
  listCustomers, resetCustomerPassword, createCustomer,
} from '../../services/admin-customers.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/dialog.js';
import { escapeHtml, formatDate } from '../../lib/dom.js';

export async function AdminCustomersPage(params) {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-6xl';

  const term = (params?.query?.q || '').trim();

  root.innerHTML = `
    <header class="mb-6 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Customers</h1>
        <p class="muted text-sm mt-1">Registered shoppers, last login info, and password resets.</p>
      </div>
      <button data-new class="btn btn-primary text-sm">+ New customer</button>
    </header>

    <form data-search class="mb-4 flex gap-2">
      <input data-q class="input flex-1" placeholder="Search name, phone or email"
             value="${escapeHtml(term)}" />
      <button class="btn btn-primary shrink-0">Search</button>
    </form>

    <div data-list class="card overflow-hidden">
      <p class="p-6 muted text-sm">Loading…</p>
    </div>
  `;

  root.querySelector('[data-search]').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = root.querySelector('[data-q]').value.trim();
    location.hash = q ? `#/admin/customers?q=${encodeURIComponent(q)}` : '#/admin/customers';
  });

  root.querySelector('[data-new]').addEventListener('click', async () => {
    const created = await openCreateCustomerModal();
    if (created) renderList();
  });

  const listEl = root.querySelector('[data-list]');

  async function renderList() {
    listEl.innerHTML = `<p class="p-6 muted text-sm">Loading…</p>`;
    let res;
    try { res = await listCustomers({ term, limit: 50 }); }
    catch (err) {
      listEl.innerHTML = `<p class="p-6" style="color:#b91c1c">${escapeHtml(err.message)}</p>`;
      return;
    }
    const rows = res.rows || [];
    if (rows.length === 0) {
      listEl.innerHTML = `<p class="p-8 text-center muted">No customers ${term ? 'matched.' : 'yet.'}</p>`;
      return;
    }
    listEl.innerHTML = `
      <ul class="divide-y" style="border-color:var(--color-border)">
        ${rows.map(renderRow).join('')}
      </ul>
      <div class="px-4 py-2 text-xs muted border-t" style="border-color:var(--color-border)">
        Showing ${rows.length} of ${res.total} customer${res.total === 1 ? '' : 's'}.
      </div>
    `;
    listEl.querySelectorAll('[data-reset]').forEach((btn) => {
      btn.addEventListener('click', () => handleReset(btn.dataset.reset, btn.dataset.label, renderList));
    });
  }

  await renderList();
  return root;
}

function renderRow(c) {
  const lockBadge = c.is_locked
    ? `<span class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
             style="background:#fee2e2;color:#b91c1c">Locked</span>` : '';
  const sourceBadge = c.source === 'admin'
    ? `<span class="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full"
             style="background:#ede9fe;color:#5b21b6" title="Created by admin">Admin-created</span>`
    : `<span class="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full"
             style="background:#e0f2fe;color:#075985" title="Self-registered">Self-registered</span>`;
  const noPwBadge = c.needs_password
    ? `<span class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
             style="background:#fef3c7;color:#92400e" title="Customer cannot sign in until you set a password">No password</span>`
    : '';
  return `
    <li class="px-4 py-3 sm:py-4 grid gap-2 sm:gap-3 sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_auto] items-start text-sm">
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium">${escapeHtml(c.full_name || '— no name —')}</span>
          ${sourceBadge}
          ${lockBadge}
          ${noPwBadge}
        </div>
        <div class="text-xs muted">${escapeHtml(c.address || '')}</div>
      </div>
      <div>
        <div class="muted text-xs">Phone</div>
        <div>${escapeHtml(c.phone || '—')}</div>
      </div>
      <div>
        <div class="muted text-xs">Email</div>
        <div class="truncate">${escapeHtml(c.email || '—')}</div>
      </div>
      <div>
        <div class="muted text-xs">Last login</div>
        <div>${c.last_login_at ? escapeHtml(formatDate(c.last_login_at)) : '<span class="muted">never</span>'}</div>
        ${c.last_login_ip ? `<div class="text-[11px] muted">${escapeHtml(c.last_login_ip)}</div>` : ''}
      </div>
      <div class="flex flex-col gap-1 sm:items-end">
        <span class="text-[11px] muted">${c.order_count} order${c.order_count === 1 ? '' : 's'}</span>
        <span class="text-[11px] muted">Joined ${escapeHtml(formatDate(c.created_at))}</span>
        <button data-reset="${escapeHtml(c.id)}"
                data-label="${escapeHtml(c.full_name || c.phone || c.email || 'this customer')}"
                class="btn btn-ghost text-xs mt-1">${c.needs_password ? 'Set password' : 'Reset password'}</button>
      </div>
    </li>`;
}

async function handleReset(customerId, label, refresh) {
  const ok = await confirmDialog({
    title: `Set/reset password for ${label}?`,
    message: 'Enter a new password on the next screen. The customer will be signed out everywhere and must use the new password to sign in.',
    confirmText: 'Continue', cancelText: 'Cancel',
  });
  if (!ok) return;

  const newPw = await promptPassword({ title: 'Set a new password' });
  if (!newPw) return;

  try {
    await resetCustomerPassword(customerId, newPw);
    showToast('Password saved — share it with the customer.', { variant: 'success' });
    refresh && refresh();
  } catch (err) {
    showToast(err.message || 'Save failed.', { variant: 'error' });
  }
}

// =====================================================================
// Create-customer modal
// =====================================================================
function openCreateCustomerModal() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto';
    backdrop.style.background = 'rgb(15 17 13 / 0.45)';
    backdrop.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.className = 'card w-full max-w-md p-5 sm:p-6 shadow-lg my-8';
    modal.innerHTML = `
      <h2 class="text-base font-semibold">New customer</h2>
      <p class="muted text-sm mt-1">
        Create an account on behalf of a customer. Tag will be <strong>Admin-created</strong>.
      </p>

      <form data-form class="mt-4 space-y-3" novalidate>
        <div>
          <label class="label">Name</label>
          <input data-name class="input" maxlength="80" placeholder="Customer's full name" />
        </div>
        <div>
          <label class="label">Phone <span style="color:#b91c1c">*</span></label>
          <input data-phone class="input" maxlength="15" inputmode="numeric"
                 placeholder="01XXXXXXXXX" required />
        </div>
        <div>
          <label class="label">Email (optional)</label>
          <input data-email type="email" class="input" maxlength="120"
                 placeholder="customer@example.com" />
        </div>
        <div>
          <label class="label">Address</label>
          <textarea data-addr class="input" rows="2" maxlength="500"
                    placeholder="House / road / area, district"></textarea>
        </div>
        <div>
          <label class="label">Delivery zone</label>
          <select data-zone class="input">
            <option value="">— Choose —</option>
            <option value="inside_dhaka">Inside Dhaka</option>
            <option value="outside_dhaka">Outside Dhaka</option>
          </select>
        </div>
        <div>
          <label class="label">Initial password (optional)</label>
          <input data-pw type="text" class="input" maxlength="100"
                 placeholder="Leave empty to set later" />
          <p class="text-xs muted mt-1">
            If empty, this customer can't sign in yet — use "Set password" later
            to issue one.
          </p>
        </div>
        <p data-err class="text-sm hidden" style="color:#b91c1c"></p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" data-cancel class="btn btn-ghost">Cancel</button>
          <button type="submit" class="btn btn-primary">Create customer</button>
        </div>
      </form>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const form     = modal.querySelector('[data-form]');
    const errEl    = modal.querySelector('[data-err]');
    const phoneEl  = modal.querySelector('[data-phone]');
    const submitEl = form.querySelector('button[type="submit"]');
    setTimeout(() => modal.querySelector('[data-name]').focus(), 50);

    phoneEl.addEventListener('input', () => {
      const cleaned = phoneEl.value.replace(/\D/g, '');
      if (cleaned !== phoneEl.value) phoneEl.value = cleaned;
    });

    function close(value) { backdrop.remove(); resolve(value); }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    modal.querySelector('[data-cancel]').addEventListener('click', () => close(null));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const phone = phoneEl.value.replace(/\D/g, '');
      if (phone.length < 7) {
        errEl.textContent = 'Please enter a valid phone number.';
        errEl.classList.remove('hidden');
        return;
      }
      submitEl.disabled = true; submitEl.textContent = 'Creating…';
      try {
        await createCustomer({
          full_name:     modal.querySelector('[data-name]').value.trim() || null,
          phone,
          email:         modal.querySelector('[data-email]').value.trim() || null,
          address:       modal.querySelector('[data-addr]').value.trim() || null,
          delivery_zone: modal.querySelector('[data-zone]').value || null,
          password:      modal.querySelector('[data-pw]').value || null,
        });
        showToast('Customer created', { variant: 'success' });
        close(true);
      } catch (err) {
        errEl.textContent = err.message || 'Create failed.';
        errEl.classList.remove('hidden');
        submitEl.disabled = false; submitEl.textContent = 'Create customer';
      }
    });
  });
}

// =====================================================================
// Reset-password modal (shared)
// =====================================================================
function promptPassword({ title = 'Set a new password' } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    backdrop.style.background = 'rgb(15 17 13 / 0.45)';
    backdrop.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.className = 'card w-full max-w-sm p-6 shadow-lg';
    modal.innerHTML = `
      <h2 class="text-base font-semibold">${escapeHtml(title)}</h2>
      <p class="muted text-sm mt-1">Minimum 6 characters. Share it out-of-band.</p>
      <input data-pw type="text" maxlength="100" autofocus class="input mt-4"
             placeholder="e.g. temp-1234" />
      <p data-err class="text-xs mt-1 hidden" style="color:#b91c1c">Must be at least 6 characters.</p>
      <div class="mt-4 flex justify-between gap-2">
        <button data-gen class="btn btn-ghost text-xs">Generate random</button>
        <div class="flex gap-2">
          <button data-cancel class="btn btn-ghost">Cancel</button>
          <button data-ok class="btn btn-primary">Save</button>
        </div>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const input = modal.querySelector('[data-pw]');
    const errEl = modal.querySelector('[data-err]');
    setTimeout(() => input.focus(), 50);

    function close(value) { backdrop.remove(); resolve(value); }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    modal.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    modal.querySelector('[data-gen]').addEventListener('click', () => {
      input.value = randomPassword();
      input.select();
    });
    modal.querySelector('[data-ok]').addEventListener('click', () => {
      const v = input.value.trim();
      if (v.length < 6) { errEl.classList.remove('hidden'); input.focus(); return; }
      close(v);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') modal.querySelector('[data-ok]').click();
      else if (e.key === 'Escape') close(null);
    });
  });
}

function randomPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => alphabet[n % alphabet.length]).join('');
}
