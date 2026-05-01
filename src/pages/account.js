import {
  isCustomerLoggedIn, fetchCustomerProfile, updateCustomerProfile,
  changeCustomerPassword, logoutCustomer,
} from '../services/customer-auth.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/dialog.js';
import { escapeHtml } from '../lib/dom.js';
import { wirePasswordToggle, eyeIcon } from '../lib/password-toggle.js';
import { AccountSubnav } from './_account-nav.js';

export async function AccountPage() {
  const root = document.createElement('section');
  root.className = 'container-x py-8 max-w-3xl';

  if (!isCustomerLoggedIn()) { location.hash = '#/login'; return root; }

  let profile = null;
  try { profile = await fetchCustomerProfile(); }
  catch (err) {
    root.innerHTML = `<div class="card p-6">Failed to load profile: ${escapeHtml(err.message)}</div>`;
    return root;
  }
  if (!profile) { location.hash = '#/login'; return root; }

  root.innerHTML = `
    <header class="mb-4 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">My account</h1>
        <p class="muted text-sm mt-1">${escapeHtml(profile.email || profile.phone || '')}</p>
      </div>
      <button data-signout class="btn btn-ghost text-sm">Sign out</button>
    </header>
  `;
  root.appendChild(AccountSubnav('profile'));

  const card = document.createElement('form');
  card.className = 'card p-5 sm:p-6 mt-4 space-y-4';
  card.innerHTML = `
    <h2 class="font-semibold">Profile</h2>
    <div>
      <label class="label" for="p-name">Full name</label>
      <input id="p-name" data-name class="input" maxlength="80"
             value="${escapeHtml(profile.full_name || '')}" placeholder="Your name" />
    </div>
    <div class="grid sm:grid-cols-2 gap-4">
      <div>
        <label class="label" for="p-phone">Phone</label>
        <input id="p-phone" data-phone class="input" maxlength="15"
               inputmode="numeric" pattern="[0-9]*"
               placeholder="01XXXXXXXXX"
               value="${escapeHtml(profile.phone || '')}" />
      </div>
      <div>
        <label class="label">Email</label>
        <input class="input" disabled value="${escapeHtml(profile.email || '—')}" />
        <p class="text-xs muted mt-1">Email is the address you registered with.</p>
      </div>
    </div>
    <div>
      <label class="label" for="p-addr">Address</label>
      <textarea id="p-addr" data-addr class="input" rows="2" maxlength="500"
                placeholder="House / road / area, district">${escapeHtml(profile.address || '')}</textarea>
    </div>
    <div>
      <label class="label" for="p-zone">Default delivery zone</label>
      <select id="p-zone" data-zone class="input">
        <option value=""              ${!profile.delivery_zone ? 'selected' : ''}>— Choose —</option>
        <option value="inside_dhaka"  ${profile.delivery_zone === 'inside_dhaka'  ? 'selected' : ''}>Inside Dhaka</option>
        <option value="outside_dhaka" ${profile.delivery_zone === 'outside_dhaka' ? 'selected' : ''}>Outside Dhaka</option>
      </select>
      <p class="text-xs muted mt-1">Used to pre-fill the checkout form.</p>
    </div>
    <div class="flex justify-end">
      <button type="submit" class="btn btn-primary">Save profile</button>
    </div>
  `;

  const phoneEl = card.querySelector('[data-phone]');
  phoneEl.addEventListener('input', () => {
    const cleaned = phoneEl.value.replace(/\D/g, '');
    if (cleaned !== phoneEl.value) phoneEl.value = cleaned;
  });

  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = card.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await updateCustomerProfile({
        full_name:     card.querySelector('[data-name]').value.trim(),
        phone:         phoneEl.value.trim(),
        address:       card.querySelector('[data-addr]').value.trim(),
        delivery_zone: card.querySelector('[data-zone]').value || null,
      });
      showToast('Profile saved', { variant: 'success' });
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
    } finally {
      btn.disabled = false; btn.textContent = 'Save profile';
    }
  });

  root.appendChild(card);

  /* ---------- Change password ---------- */
  const pwForm = document.createElement('form');
  pwForm.className = 'card p-5 sm:p-6 mt-4 space-y-4';
  pwForm.innerHTML = `
    <h2 class="font-semibold">Change password</h2>
    <p class="text-xs muted">If an admin gave you a temporary password, set your own here.</p>
    <div>
      <label class="label" for="pw-old">Current password</label>
      <div class="relative">
        <input id="pw-old" data-old data-pw type="password" class="input pr-10" required
               autocomplete="current-password" />
        <button type="button" data-pw-toggle aria-label="Show password"
                class="absolute inset-y-0 right-2 flex items-center muted hover:opacity-70">
          ${eyeIcon()}
        </button>
      </div>
    </div>
    <div>
      <label class="label" for="pw-new">New password</label>
      <div class="relative">
        <input id="pw-new" data-new data-pw type="password" class="input pr-10" required minlength="6"
               autocomplete="new-password" placeholder="At least 6 characters" />
        <button type="button" data-pw-toggle aria-label="Show password"
                class="absolute inset-y-0 right-2 flex items-center muted hover:opacity-70">
          ${eyeIcon()}
        </button>
      </div>
    </div>
    <p data-pw-error class="text-sm hidden" style="color:#b91c1c"></p>
    <div class="flex justify-end">
      <button type="submit" class="btn btn-primary">Update password</button>
    </div>
  `;
  wirePasswordToggle(pwForm);

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = pwForm.querySelector('[data-pw-error]');
    errEl.classList.add('hidden');
    const btn = pwForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Updating…';
    try {
      await changeCustomerPassword({
        oldPassword: pwForm.querySelector('[data-old]').value,
        newPassword: pwForm.querySelector('[data-new]').value,
      });
      pwForm.reset();
      showToast('Password updated', { variant: 'success' });
    } catch (err) {
      errEl.textContent = err.message || 'Update failed.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Update password';
    }
  });

  root.appendChild(pwForm);

  root.querySelector('[data-signout]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Sign out?', confirmText: 'Sign out', cancelText: 'Stay',
      message: 'You can sign back in any time.',
    });
    if (!ok) return;
    await logoutCustomer();
    showToast('Signed out');
    location.hash = '#/login';
  });

  return root;
}
