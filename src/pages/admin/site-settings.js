import { supabase } from '../../services/supabase.js';
import { getFlags, getBranding, refreshBranding, _setCachedFlags } from '../../services/branding.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

// Schema for the toggles rendered on this page. Add a new entry here when
// you add a new flag (also update DEFAULT_FLAGS in branding.js + the
// migration so the column has the key on existing rows).
const FLAG_SCHEMA = [
  {
    key: 'show_stock',
    title: 'Show exact stock quantity on the public site',
    description:
      'When ON, customers see numbers like "30 in stock" and "Only 3 left". ' +
      'When OFF, they only see "In stock" / "Low stock" without the count. ' +
      '"Sold out" always shows in both modes.',
  },
  {
    key: 'show_sold',
    title: 'Show "sold" counter on the public site',
    description:
      'When ON, the sold count entered in each product (e.g. "120 sold") ' +
      'appears on product cards and detail pages. When OFF it stays hidden. ' +
      'Products with a sold count of 0 never display this regardless.',
  },
  {
    key: 'show_route_loader',
    title: 'Show top progress bar during page transitions',
    description:
      'When ON, a thin animated bar appears at the top of the page while ' +
      'the next page loads. Helpful on slower connections. Turn OFF to keep ' +
      'navigation completely silent.',
  },
];

export async function AdminSiteSettings() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-2xl';

  const flags = getFlags();
  const brand = getBranding();

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Site settings</h1>
      <p class="muted text-sm mt-1">
        Feature flags that change how the public site behaves. Saved instantly.
      </p>
    </header>

    <div data-list class="space-y-3"></div>

    <div class="mt-8 card p-5 sm:p-6">
      <h2 class="font-semibold text-lg">Order policy</h2>
      <p class="muted text-sm mt-1">
        Rate limit + delivery charges applied at checkout.
      </p>
      <form data-orders-form class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label" for="rl-count">Max orders per phone</label>
          <input id="rl-count" data-rate-count type="number" min="1" max="100"
                 class="input"
                 value="${escapeHtml(String(brand.order_rate_limit_count ?? 5))}" />
        </div>
        <div>
          <label class="label" for="rl-mins">Within (minutes)</label>
          <input id="rl-mins" data-rate-mins type="number" min="1" max="1440"
                 class="input"
                 value="${escapeHtml(String(brand.order_rate_limit_minutes ?? 15))}" />
        </div>
        <div class="sm:col-span-2 pt-2 border-t" style="border-color:var(--color-border)">
          <div class="text-sm font-medium mb-1">Inside-Dhaka zone</div>
          <p class="text-xs muted">Label + charge shown at checkout.</p>
        </div>
        <div>
          <label class="label" for="lbl-in">Label</label>
          <input id="lbl-in" data-label-inside type="text" maxlength="60"
                 class="input"
                 value="${escapeHtml(brand.delivery_label_inside_dhaka || 'Inside Dhaka')}" />
        </div>
        <div>
          <label class="label" for="dc-in">Charge (৳)</label>
          <input id="dc-in" data-inside type="number" min="0" step="0.01"
                 class="input"
                 value="${escapeHtml(String(brand.delivery_charge_inside_dhaka ?? 60))}" />
        </div>

        <div class="sm:col-span-2 pt-2 border-t" style="border-color:var(--color-border)">
          <div class="text-sm font-medium mb-1">Outside-Dhaka zone</div>
          <p class="text-xs muted">Label + charge shown at checkout.</p>
        </div>
        <div>
          <label class="label" for="lbl-out">Label</label>
          <input id="lbl-out" data-label-outside type="text" maxlength="60"
                 class="input"
                 value="${escapeHtml(brand.delivery_label_outside_dhaka || 'Outside Dhaka')}" />
        </div>
        <div>
          <label class="label" for="dc-out">Charge (৳)</label>
          <input id="dc-out" data-outside type="number" min="0" step="0.01"
                 class="input"
                 value="${escapeHtml(String(brand.delivery_charge_outside_dhaka ?? 130))}" />
        </div>

        <p class="sm:col-span-2 text-xs muted">
          Customers pick a zone at checkout. Admins can still tweak charge
          per-order before shipping.
        </p>

        <div class="sm:col-span-2 pt-2 border-t" style="border-color:var(--color-border)">
          <div class="text-sm font-medium mb-1">Order chat</div>
          <p class="text-xs muted">Total messages allowed per order (shared between customer and admin).</p>
        </div>
        <div>
          <label class="label" for="msg-limit">Message limit per order</label>
          <input id="msg-limit" data-msg-limit type="number" min="0" max="100"
                 class="input"
                 value="${escapeHtml(String(brand.order_message_limit ?? 10))}" />
          <p class="text-xs muted mt-1">Set to 0 to disable order chat entirely.</p>
        </div>

        <div class="sm:col-span-2 pt-2 border-t" style="border-color:var(--color-border)">
          <div class="text-sm font-medium mb-1">Customer accounts</div>
          <p class="text-xs muted">Where the "Send message" button on the public Forgot-password page takes the customer.</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="reset-url">Forgot-password contact link</label>
          <input id="reset-url" data-reset-url type="url" maxlength="500"
                 class="input"
                 placeholder="https://wa.me/8801XXXXXXXXX?text=I%20forgot%20my%20password"
                 value="${escapeHtml(brand.password_reset_url || '')}" />
          <p class="text-xs muted mt-1">
            Where the "Send message" button on <code>/forgot-password</code> takes the customer.
            Typically a WhatsApp link (<code>https://wa.me/&lt;number&gt;?text=…</code>) or <code>tel:</code> link.
            Leave empty to disable the button.
          </p>
        </div>

        <div class="sm:col-span-2 flex justify-end">
          <button type="submit" class="btn btn-primary">Save order policy</button>
        </div>
      </form>
    </div>
  `;
  const list = root.querySelector('[data-list]');

  for (const flag of FLAG_SCHEMA) {
    list.appendChild(toggleRow(flag, !!flags[flag.key]));
  }

  /* Order policy form. */
  const ordersForm = root.querySelector('[data-orders-form]');
  ordersForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const count       = Number(ordersForm.querySelector('[data-rate-count]').value);
    const mins        = Number(ordersForm.querySelector('[data-rate-mins]').value);
    const inside      = Number(ordersForm.querySelector('[data-inside]').value);
    const outside     = Number(ordersForm.querySelector('[data-outside]').value);
    const insideLabel = ordersForm.querySelector('[data-label-inside]').value.trim();
    const outsideLabel= ordersForm.querySelector('[data-label-outside]').value.trim();
    const msgLimit    = Math.max(0, Math.min(100, Number(ordersForm.querySelector('[data-msg-limit]').value) || 0));
    const resetUrl    = (ordersForm.querySelector('[data-reset-url]').value || '').trim();
    if (count < 1 || mins < 1 || inside < 0 || outside < 0
        || !insideLabel || !outsideLabel) {
      showToast('Please fill in all fields with valid values.', { variant: 'error' });
      return;
    }
    const btn = ordersForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          order_rate_limit_count: count,
          order_rate_limit_minutes: mins,
          delivery_charge_inside_dhaka:  inside,
          delivery_charge_outside_dhaka: outside,
          delivery_label_inside_dhaka:   insideLabel,
          delivery_label_outside_dhaka:  outsideLabel,
          order_message_limit:           msgLimit,
          password_reset_url:            resetUrl || null,
        })
        .eq('id', 1);
      if (error) throw error;
      await refreshBranding();
      showToast('Order policy saved', { variant: 'success' });
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
    } finally {
      btn.disabled = false; btn.textContent = 'Save order policy';
    }
  });

  return root;
}

function toggleRow(flag, initial) {
  const row = document.createElement('div');
  row.className = 'card p-5 flex items-start gap-4';

  row.innerHTML = `
    <div class="flex-1 min-w-0">
      <div class="font-medium">${escapeHtml(flag.title)}</div>
      <p class="text-sm muted mt-1 leading-relaxed">${escapeHtml(flag.description)}</p>
    </div>
    <label class="relative inline-flex shrink-0 cursor-pointer">
      <input data-toggle type="checkbox" class="sr-only peer" ${initial ? 'checked' : ''}>
      <span class="block w-11 h-6 rounded-full transition"
            style="background: var(--color-border)"></span>
      <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition"></span>
    </label>
  `;

  // Switch styling — paint the track + dot based on state.
  const cb = row.querySelector('[data-toggle]');
  const track = row.querySelector('label > span:first-of-type');
  const dot = row.querySelector('label > span:last-of-type');
  function paint() {
    if (cb.checked) {
      track.style.background = 'var(--color-primary)';
      dot.style.transform = 'translateX(20px)';
    } else {
      track.style.background = 'var(--color-border)';
      dot.style.transform = 'translateX(0)';
    }
  }
  paint();

  let inFlight = false;
  cb.addEventListener('change', async () => {
    if (inFlight) return;
    inFlight = true;
    paint();
    cb.disabled = true;

    const desired = cb.checked;
    try {
      // jsonb_set-style merge so other flags aren't disturbed.
      const { data, error } = await supabase
        .from('settings')
        .update({ flags: { ...getFlags(), [flag.key]: desired } })
        .eq('id', 1)
        .select('flags')
        .single();
      if (error) throw error;
      _setCachedFlags(data.flags || {});
      showToast(desired ? 'Turned on' : 'Turned off', { variant: 'success' });
    } catch (err) {
      cb.checked = !desired;
      paint();
      showToast(err.message || 'Could not save', { variant: 'error' });
    } finally {
      cb.disabled = false;
      inFlight = false;
    }
  });

  return row;
}
