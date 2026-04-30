import { getCart, clearCart } from '../services/cart.js';
import { supabase } from '../services/supabase.js';
import { placeOrder } from '../services/orders.js';
import { formatPrice } from '../services/products.js';
import { getBranding } from '../services/branding.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/dialog.js';
import { escapeHtml } from '../lib/dom.js';
import { pushRecentOrder } from '../lib/recent-orders.js';
import { navigate } from '../services/router.js';

const CUSTOMER_KEY = 'checkout_customer_v1';

function loadSavedCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.name || !parsed?.phone || !parsed?.address) return null;
    return parsed;
  } catch { return null; }
}

function saveCustomer({ name, phone, address }) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, phone, address }));
  } catch {}
}

function clearSavedCustomer() {
  try { localStorage.removeItem(CUSTOMER_KEY); } catch {}
}

export async function CheckoutPage() {
  const root = document.createElement('section');
  root.className = 'container-x py-10';

  const cart = getCart();
  if (cart.length === 0) {
    root.innerHTML = `
      <div class="text-center py-20">
        <h1 class="text-2xl font-bold tracking-tight">Your cart is empty</h1>
        <p class="muted mt-2">Add something before checking out.</p>
        <a href="#/products" class="btn btn-primary mt-6">Browse products</a>
      </div>
    `;
    return root;
  }

  // Hydrate cart with product data.
  const ids = cart.map((c) => c.productId);
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, image_url, stock')
    .in('id', ids);
  if (error) {
    root.innerHTML = `
      <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
        Failed to load cart: ${escapeHtml(error.message)}
      </div>`;
    return root;
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const items = cart.filter((c) => byId.has(c.productId));
  const subtotal = items.reduce((s, it) => s + Number(byId.get(it.productId).price) * it.qty, 0);

  const brand = getBranding();
  const zoneFee = {
    inside_dhaka:  Number(brand.delivery_charge_inside_dhaka  || 0),
    outside_dhaka: Number(brand.delivery_charge_outside_dhaka || 0),
  };
  const zoneLabel = {
    inside_dhaka:  brand.delivery_label_inside_dhaka  || 'Inside Dhaka',
    outside_dhaka: brand.delivery_label_outside_dhaka || 'Outside Dhaka',
  };
  let zone = 'inside_dhaka'; // default selection

  root.innerHTML = `
    <header class="mb-8">
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">Checkout</h1>
      <p class="muted mt-1 text-sm">Cash on delivery — pay when your order arrives.</p>
    </header>

    <div class="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <form data-form class="card p-5 sm:p-6 space-y-5" novalidate>
        <h2 class="font-semibold text-lg">Delivery details</h2>

        <div>
          <label class="label" for="c-name">Name <span style="color:#b91c1c">*</span></label>
          <input id="c-name" data-name class="input" maxlength="80" required autocomplete="name" />
          <p data-err-name class="text-xs mt-1 hidden" style="color:#b91c1c"></p>
        </div>
        <div>
          <label class="label" for="c-phone">Phone <span style="color:#b91c1c">*</span></label>
          <input id="c-phone" data-phone class="input" maxlength="15" required
                 inputmode="numeric" pattern="[0-9]*" autocomplete="tel"
                 placeholder="01XXXXXXXXX" />
          <p data-err-phone class="text-xs mt-1 hidden" style="color:#b91c1c"></p>
        </div>
        <div>
          <label class="label" for="c-address">Address <span style="color:#b91c1c">*</span></label>
          <textarea id="c-address" data-address class="input" rows="3" required
                    autocomplete="street-address"
                    placeholder="House, road, area, district"></textarea>
          <p data-err-address class="text-xs mt-1 hidden" style="color:#b91c1c"></p>
        </div>

        <div>
          <span class="label">Delivery zone <span style="color:#b91c1c">*</span></span>
          <div class="grid grid-cols-2 gap-2" data-zones>
            ${zoneOption('inside_dhaka',  zoneLabel.inside_dhaka,  zoneFee.inside_dhaka,  true)}
            ${zoneOption('outside_dhaka', zoneLabel.outside_dhaka, zoneFee.outside_dhaka, false)}
          </div>
        </div>

        <div>
          <label class="label" for="c-note">Note (optional)</label>
          <textarea id="c-note" data-note class="input" rows="2" maxlength="500"
                    placeholder="Anything we should know about your order"></textarea>
        </div>

        <div class="pt-2 flex justify-end">
          <button data-submit type="submit" class="btn btn-primary">
            Place order
          </button>
        </div>
      </form>

      <aside class="card p-5 sm:p-6 lg:sticky lg:top-20">
        <div class="text-sm font-semibold">Order summary</div>
        <ul class="mt-4 space-y-2 text-sm">
          ${items.map((it) => {
            const p = byId.get(it.productId);
            return `<li class="flex justify-between gap-3">
              <span class="line-clamp-1">${escapeHtml(p.name)} × ${it.qty}</span>
              <span class="font-medium shrink-0">${formatPrice(Number(p.price) * it.qty)}</span>
            </li>`;
          }).join('')}
        </ul>
        <dl class="mt-4 pt-4 border-t space-y-2 text-sm" style="border-color:var(--color-border)">
          <div class="flex justify-between"><dt class="muted">Subtotal</dt><dd>${formatPrice(subtotal)}</dd></div>
          <div class="flex justify-between"><dt class="muted">Delivery (<span data-zone-label>${escapeHtml(zoneLabel.inside_dhaka)}</span>)</dt>
            <dd data-charge-amt>${formatPrice(zoneFee.inside_dhaka)}</dd></div>
        </dl>
        <div class="mt-4 pt-4 border-t flex justify-between items-baseline divider"
             style="border-color:var(--color-border)">
          <span class="font-semibold">Total</span>
          <span class="text-xl font-semibold" style="color:var(--color-primary)" data-total>
            ${formatPrice(subtotal + zoneFee.inside_dhaka)}
          </span>
        </div>
        <a href="#/cart" class="block text-center text-xs muted hover:underline mt-4">
          ← Back to cart
        </a>
      </aside>
    </div>
  `;

  const form    = root.querySelector('[data-form]');
  const nameEl  = root.querySelector('[data-name]');
  const phoneEl = root.querySelector('[data-phone]');
  const addrEl  = root.querySelector('[data-address]');
  const noteEl  = root.querySelector('[data-note]');
  const submitBtn = root.querySelector('[data-submit]');
  // Strip any non-digit input as the user types (paste, autocomplete, etc).
  phoneEl.addEventListener('input', () => {
    const cleaned = phoneEl.value.replace(/\D/g, '');
    if (cleaned !== phoneEl.value) phoneEl.value = cleaned;
  });

  // Offer to autofill from a previous order on this device. We defer the
  // dialog so the page paints first, otherwise the modal appears before the
  // form is visible.
  const saved = loadSavedCustomer();
  if (saved) {
    setTimeout(async () => {
      const ok = await confirmDialog({
        title: 'Use saved details?',
        message: `We found delivery info from a previous order on this device — ${saved.name}, ${saved.phone}. Want to fill it in?`,
        confirmText: 'Yes, use these',
        cancelText: 'No, I\'ll type',
      });
      if (ok) {
        nameEl.value  = saved.name;
        phoneEl.value = saved.phone.replace(/\D/g, '');
        addrEl.value  = saved.address;
      } else {
        // User said no — drop the saved data so we don't pester them again.
        clearSavedCustomer();
      }
    }, 60);
  }

  const zonesEl = root.querySelector('[data-zones]');
  const zoneLabelEl = root.querySelector('[data-zone-label]');
  const chargeAmtEl = root.querySelector('[data-charge-amt]');
  const totalEl = root.querySelector('[data-total]');

  function paintZones() {
    zonesEl.querySelectorAll('[data-zone]').forEach((el) => {
      const active = el.dataset.zone === zone;
      el.style.borderColor = active ? 'var(--color-primary)' : 'var(--color-border)';
      el.style.background = active ? 'var(--color-primary-soft)' : 'var(--color-surface)';
      el.querySelector('[data-radio]').style.background = active ? 'var(--color-primary)' : 'transparent';
      el.querySelector('[data-radio]').style.borderColor = active ? 'var(--color-primary)' : 'var(--color-border)';
    });
    zoneLabelEl.textContent = zoneLabel[zone];
    chargeAmtEl.textContent = formatPrice(zoneFee[zone]);
    totalEl.textContent = formatPrice(subtotal + zoneFee[zone]);
  }
  zonesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zone]');
    if (!btn) return;
    zone = btn.dataset.zone;
    paintZones();
  });
  paintZones();

  function showError(field, msg) {
    const el = root.querySelector(`[data-err-${field}]`);
    if (msg) {
      el.textContent = msg;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  function validate() {
    let ok = true;
    showError('name', null);
    showError('phone', null);
    showError('address', null);
    if (nameEl.value.trim().length < 2) {
      showError('name', 'Please enter your full name.');
      ok = false;
    }
    // Bangladesh-style phones are typically 11 digits (017XXXXXXXX). Be lenient
    // about formatting (spaces, +880) but require at least 7 digits overall.
    const phoneDigits = phoneEl.value.replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      showError('phone', 'Please enter a valid phone number.');
      ok = false;
    }
    if (addrEl.value.trim().length < 5) {
      showError('address', 'Please enter your full delivery address.');
      ok = false;
    }
    return ok;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Placing order…';
    try {
      const result = await placeOrder(
        {
          name: nameEl.value,
          phone: phoneEl.value,
          address: addrEl.value,
          note: noteEl.value,
          deliveryZone: zone,
        },
        items.map((it) => ({ productId: it.productId, qty: it.qty }))
      );
      saveCustomer({
        name: nameEl.value.trim(),
        phone: phoneEl.value.trim(),
        address: addrEl.value.trim(),
      });
      pushRecentOrder(result.order_number);
      clearCart();
      navigate(`/order/${result.order_number}?fresh=1`);
    } catch (err) {
      showToast(err.message || 'Could not place order', { variant: 'error' });
      // Re-validate to surface server-side validation errors inline.
      if (err.code === 'phone') showError('phone', err.message);
      if (err.code === 'name') showError('name', err.message);
      if (err.code === 'address') showError('address', err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Place order';
    }
  });

  return root;
}

function zoneOption(value, label, fee, defaultActive) {
  return `
    <button type="button" data-zone="${value}"
            class="text-left p-3 rounded-md transition flex items-start gap-3"
            style="border:1px solid ${defaultActive ? 'var(--color-primary)' : 'var(--color-border)'};
                   background:${defaultActive ? 'var(--color-primary-soft)' : 'var(--color-surface)'}">
      <span data-radio class="shrink-0 mt-0.5 inline-block w-4 h-4 rounded-full"
            style="border:2px solid ${defaultActive ? 'var(--color-primary)' : 'var(--color-border)'};
                   background:${defaultActive ? 'var(--color-primary)' : 'transparent'}"></span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium">${label}</span>
        <span class="block text-xs muted mt-0.5">৳${Number(fee).toLocaleString('en-US')}</span>
      </span>
    </button>
  `;
}
