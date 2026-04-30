import {
  getAdminOrder,
  updateOrderStatus,
  updateOrderCharges,
  updateOrderTrackingId,
  markOrderViewed,
} from '../../services/admin-orders.js';
import { STATUS_META, ZONE_LABELS } from '../../services/orders.js';
import { getBranding } from '../../services/branding.js';
import { formatPrice } from '../../services/products.js';
import { statusBadge } from '../../components/status-badge.js';
import { confirmDialog } from '../../components/dialog.js';
import { showToast } from '../../components/toast.js';
import { notifyPendingChanged } from '../../components/admin-layout.js';
import { escapeHtml } from '../../lib/dom.js';

// Map of legal next statuses for each current status. Mirrors the SQL RPC.
const NEXT = {
  pending:   ['approved', 'cancelled'],
  approved:  ['shipped',  'cancelled'],
  shipped:   ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned:  [],
};

export async function AdminOrderDetailPage(params) {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-4xl';

  let order;
  try {
    order = await getAdminOrder(params.id);
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return root;
  }

  // First-time view marks the order as seen so it stops counting toward the
  // sidebar badge. Deferred so the AdminLayout has registered itself first.
  if (order.status === 'pending' && !order.viewed_at) {
    setTimeout(async () => {
      await markOrderViewed(order.id);
      notifyPendingChanged();
    }, 0);
  }

  function rerender() {
    root.innerHTML = '';
    root.appendChild(renderOrder());
  }

  function renderOrder() {
    const wrap = document.createElement('div');
    const placed = new Date(order.placed_at).toLocaleString();
    const meta = STATUS_META[order.status] || STATUS_META.pending;
    const nexts = NEXT[order.status] || [];

    wrap.innerHTML = `
      <header class="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <a href="#/admin/orders" class="text-sm muted hover:underline">← All orders</a>
          <h1 class="mt-1 text-2xl sm:text-3xl font-bold tracking-tight font-mono">
            ${escapeHtml(order.order_number)}
          </h1>
          <p class="muted text-sm mt-1">Placed ${escapeHtml(placed)}</p>
        </div>
        <div>${statusBadge(order.status)}</div>
      </header>

      <div class="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div class="space-y-6">
          ${customerCard(order)}
          ${itemsCard(order)}
          ${chargesCard(order)}
          ${eventsCard(order)}
        </div>
        <aside class="space-y-3">
          ${actionsCard(order, nexts, meta)}
        </aside>
      </div>
    `;

    /* Wire status transition buttons. */
    wrap.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action));
    });

    /* Wire "Edit" tracking ID button. */
    const editTrackingBtn = wrap.querySelector('[data-edit-tracking]');
    if (editTrackingBtn) {
      editTrackingBtn.addEventListener('click', async () => {
        const next = await promptTrackingId({
          title: 'Update tracking ID',
          message: 'Replace the current tracking ID. Customers will see the new value immediately.',
          initialValue: order.tracking_id || '',
          confirmText: 'Save',
        });
        if (!next || next === order.tracking_id) return;
        try {
          await updateOrderTrackingId({ orderId: order.id, trackingId: next });
          showToast('Tracking ID updated', { variant: 'success' });
          order = await getAdminOrder(order.id);
          rerender();
        } catch (err) {
          showToast(err.message || 'Update failed', { variant: 'error' });
        }
      });
    }

    /* Wire charges form. */
    const chargesForm = wrap.querySelector('[data-charges-form]');
    if (chargesForm) {
      chargesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const discount = Number(chargesForm.querySelector('[data-discount]').value || 0);
        const charge = Number(chargesForm.querySelector('[data-charge]').value || 0);
        const btn = chargesForm.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          await updateOrderCharges({ orderId: order.id, discount, charge });
          showToast('Charges updated', { variant: 'success' });
          order = await getAdminOrder(order.id);
          rerender();
        } catch (err) {
          showToast(err.message || 'Save failed', { variant: 'error' });
          btn.disabled = false; btn.textContent = 'Save charges';
        }
      });
    }

    return wrap;
  }

  async function handleAction(action) {
    if (action === 'shipped') {
      const trackingId = await promptTrackingId();
      if (!trackingId) return;
      await applyTransition('shipped', { trackingId });
    } else if (action === 'cancelled') {
      const ok = await confirmDialog({
        title: 'Cancel this order?',
        message: order.status === 'approved'
          ? 'Stock will be returned to inventory. This cannot be undone.'
          : 'The order will be marked cancelled. This cannot be undone.',
        confirmText: 'Cancel order',
        cancelText: 'Keep',
        variant: 'danger',
      });
      if (!ok) return;
      await applyTransition('cancelled');
    } else if (action === 'returned') {
      const ok = await confirmDialog({
        title: 'Mark as returned?',
        message: 'Stock will be returned to inventory.',
        confirmText: 'Mark returned',
        variant: 'danger',
      });
      if (!ok) return;
      await applyTransition('returned');
    } else {
      // approved, delivered: simple confirm.
      const map = {
        approved:  { title: 'Approve this order?',  message: 'Stock will be deducted now.', confirm: 'Approve' },
        delivered: { title: 'Mark as delivered?',   message: 'The order is complete.',      confirm: 'Mark delivered' },
      };
      const cfg = map[action];
      const ok = await confirmDialog({
        title: cfg.title, message: cfg.message,
        confirmText: cfg.confirm, cancelText: 'Cancel',
      });
      if (!ok) return;
      await applyTransition(action);
    }
  }

  async function applyTransition(newStatus, { trackingId } = {}) {
    try {
      await updateOrderStatus({ orderId: order.id, newStatus, trackingId });
      showToast(`Status → ${newStatus}`, { variant: 'success' });
      order = await getAdminOrder(order.id);
      notifyPendingChanged();
      rerender();
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('insufficient_stock')) {
        showToast('Cannot approve — one of the items has insufficient stock.', { variant: 'error' });
      } else if (msg.includes('illegal_transition')) {
        showToast('That status change isn\'t allowed.', { variant: 'error' });
      } else {
        showToast(err.message || 'Update failed', { variant: 'error' });
      }
    }
  }

  rerender();
  return root;
}

/* ---------- Cards ---------- */

function customerCard(order) {
  const phoneDigits = (order.customer_phone || '').replace(/\D/g, '');
  const waLink = phoneDigits ? `https://wa.me/${toBdInternational(phoneDigits)}` : null;
  const telLink = phoneDigits ? `tel:${order.customer_phone}` : null;
  return `
    <div class="card p-5 sm:p-6">
      <h2 class="font-semibold mb-3">Customer</h2>
      <dl class="text-sm space-y-2">
        <div class="flex gap-3"><dt class="muted w-20 shrink-0">Name</dt><dd>${escapeHtml(order.customer_name)}</dd></div>
        <div class="flex gap-3">
          <dt class="muted w-20 shrink-0">Phone</dt>
          <dd class="flex-1">
            ${escapeHtml(order.customer_phone)}
            ${telLink   ? `<a href="${telLink}" class="ml-3 text-xs hover:underline" style="color:var(--color-primary)">Call</a>` : ''}
            ${waLink    ? `<a href="${waLink}" target="_blank" rel="noopener" class="ml-2 text-xs hover:underline" style="color:var(--color-primary)">WhatsApp</a>` : ''}
          </dd>
        </div>
        <div class="flex gap-3"><dt class="muted w-20 shrink-0">Address</dt><dd class="whitespace-pre-line">${escapeHtml(order.customer_address)}</dd></div>
        ${order.delivery_zone
          ? `<div class="flex gap-3"><dt class="muted w-20 shrink-0">Zone</dt><dd>${escapeHtml(zoneLabelOf(order.delivery_zone))}</dd></div>`
          : ''}
        ${order.customer_note
          ? `<div class="flex gap-3"><dt class="muted w-20 shrink-0">Note</dt><dd>${escapeHtml(order.customer_note)}</dd></div>`
          : ''}
      </dl>
    </div>
  `;
}

function itemsCard(order) {
  return `
    <div class="card p-5 sm:p-6">
      <h2 class="font-semibold mb-3">Items</h2>
      <table class="w-full text-sm">
        <thead class="text-xs uppercase muted tracking-wider">
          <tr class="border-b" style="border-color:var(--color-border)">
            <th class="text-left py-2 font-medium">Product</th>
            <th class="text-right py-2 font-medium">Price</th>
            <th class="text-right py-2 font-medium">Qty</th>
            <th class="text-right py-2 font-medium">Line total</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map((it) => `
            <tr class="border-b" style="border-color:var(--color-border)">
              <td class="py-2.5">
                <div class="font-medium">${escapeHtml(it.product_name)}</div>
                ${it.product_id
                  ? `<div class="text-[11px] muted font-mono">${it.product_id}</div>`
                  : `<div class="text-[11px] muted">(product removed)</div>`}
              </td>
              <td class="py-2.5 text-right">${formatPrice(it.product_price)}</td>
              <td class="py-2.5 text-right">${it.quantity}</td>
              <td class="py-2.5 text-right font-medium">${formatPrice(it.line_total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function chargesCard(order) {
  const editable = order.status === 'pending' || order.status === 'approved';
  return `
    <div class="card p-5 sm:p-6">
      <h2 class="font-semibold mb-3">Totals</h2>
      <dl class="text-sm space-y-2">
        <div class="flex justify-between"><dt class="muted">Subtotal</dt><dd>${formatPrice(order.subtotal)}</dd></div>
        <div class="flex justify-between"><dt class="muted">Discount</dt><dd>− ${formatPrice(order.discount_amount)}</dd></div>
        <div class="flex justify-between"><dt class="muted">Charge</dt><dd>${formatPrice(order.charge_amount)}</dd></div>
        <div class="flex justify-between pt-2 border-t" style="border-color:var(--color-border)">
          <dt class="font-semibold">Total</dt>
          <dd class="font-semibold" style="color:var(--color-primary)">${formatPrice(order.total_amount)}</dd>
        </div>
      </dl>
      ${editable ? `
        <form data-charges-form class="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label class="label">Discount</label>
            <input data-discount type="number" min="0" step="0.01" class="input"
                   value="${escapeHtml(String(order.discount_amount))}" />
          </div>
          <div>
            <label class="label">Charge</label>
            <input data-charge type="number" min="0" step="0.01" class="input"
                   value="${escapeHtml(String(order.charge_amount))}" />
          </div>
          <div class="col-span-2 flex justify-end">
            <button type="submit" class="btn btn-primary text-sm">Save charges</button>
          </div>
        </form>
      ` : `<p class="text-xs muted mt-3">Charges are locked once an order is shipped.</p>`}
    </div>
  `;
}

function eventsCard(order) {
  const events = order.events || [];
  if (events.length === 0) return '';
  return `
    <div class="card p-5 sm:p-6">
      <h2 class="font-semibold mb-3">Status history</h2>
      <ol class="space-y-2 text-sm">
        ${events.map((ev) => `
          <li class="flex items-start gap-3">
            <span class="mt-1.5 w-2 h-2 rounded-full shrink-0"
                  style="background:var(--color-primary)"></span>
            <div class="flex-1">
              <div>
                ${ev.from_status ? `<span class="muted">${escapeHtml(ev.from_status)} → </span>` : ''}
                <span class="font-medium">${escapeHtml(ev.to_status)}</span>
              </div>
              ${ev.note ? `<div class="text-xs muted">${escapeHtml(ev.note)}</div>` : ''}
              <div class="text-[11px] muted">${new Date(ev.created_at).toLocaleString()}</div>
            </div>
          </li>
        `).join('')}
      </ol>
    </div>
  `;
}

// Action labels + hints shown in the sidebar. Hints describe the side effect
// so the admin knows what they're committing to before clicking.
const ACTION_CONFIG = {
  approved:  { label: 'Approve order',     hint: 'Stock will be deducted now.',          primary: true,  danger: false },
  shipped:   { label: 'Ship order',        hint: 'You\'ll be asked for a tracking ID.',  primary: true,  danger: false },
  delivered: { label: 'Mark as delivered', hint: 'Marks the order as completed.',        primary: true,  danger: false },
  cancelled: { label: 'Cancel order',      hint: 'Stock is restored if it was deducted.',primary: false, danger: true  },
  returned:  { label: 'Mark as returned',  hint: 'Stock is restored to inventory.',      primary: false, danger: true  },
};

function actionsCard(order, nexts, meta) {
  if (nexts.length === 0) {
    return `
      <div class="card p-5 sm:p-6">
        <div class="text-xs uppercase muted tracking-wider">Status</div>
        <div class="mt-2">${statusBadge(order.status)}</div>
        <p class="text-xs muted mt-3">
          This order is finalised. No further actions can be taken.
        </p>
        ${order.tracking_id
          ? `<div class="mt-4 pt-4 border-t text-xs" style="border-color:var(--color-border)">
               <div class="muted">Tracking ID</div>
               <div class="font-mono mt-0.5">${escapeHtml(order.tracking_id)}</div>
             </div>`
          : ''}
      </div>`;
  }
  return `
    <div class="card p-5 sm:p-6">
      <div class="text-xs uppercase muted tracking-wider">Status</div>
      <div class="mt-2 mb-5">${statusBadge(order.status)}</div>

      <h2 class="font-semibold text-sm">What's next?</h2>
      <p class="muted text-xs mt-0.5 mb-4">Pick the next step for this order.</p>

      <div class="space-y-3">
        ${nexts.map((s) => actionButton(s)).join('')}
      </div>

      ${order.tracking_id
        ? `<div class="mt-5 pt-4 border-t text-xs" style="border-color:var(--color-border)">
             <div class="flex items-center justify-between">
               <span class="muted">Tracking ID</span>
               <button data-edit-tracking type="button"
                       class="text-xs hover:underline"
                       style="color:var(--color-primary)">Edit</button>
             </div>
             <div class="font-mono mt-0.5 break-all">${escapeHtml(order.tracking_id)}</div>
           </div>`
        : ''}
    </div>
  `;
}

function actionButton(next) {
  const cfg = ACTION_CONFIG[next] || { label: next, hint: '', primary: false, danger: false };
  const cls = cfg.primary ? 'btn btn-primary' : 'btn btn-ghost';
  const style = cfg.danger ? 'style="color:#b91c1c"' : '';
  return `
    <div>
      <button data-action="${next}" class="${cls} w-full justify-center text-sm" ${style}>
        ${escapeHtml(cfg.label)}
      </button>
      <p class="text-[11px] muted mt-1.5 px-1 leading-snug">${escapeHtml(cfg.hint)}</p>
    </div>
  `;
}

// WhatsApp's wa.me link wants an international-format number with no plus
// sign. Customers in Bangladesh typically enter `01XXXXXXXXX` (11 digits with
// a leading 0). We rewrite that to `8801XXXXXXXXX`. Numbers already in
// `880…` form are passed through.
function toBdInternational(digits) {
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0'))   return '880' + digits.slice(1);
  return '880' + digits;
}

function zoneLabelOf(zone) {
  const b = getBranding();
  if (zone === 'inside_dhaka')  return b.delivery_label_inside_dhaka  || ZONE_LABELS.inside_dhaka;
  if (zone === 'outside_dhaka') return b.delivery_label_outside_dhaka || ZONE_LABELS.outside_dhaka;
  return ZONE_LABELS[zone] || zone;
}

/* ---------- Tracking ID prompt ---------- */

function promptTrackingId({
  title = 'Enter tracking ID',
  message = 'Required to mark this order as shipped. Customers can search using either the order ID or this tracking ID.',
  initialValue = '',
  confirmText = 'Ship order',
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    backdrop.style.background = 'rgb(15 17 13 / 0.45)';
    backdrop.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.className = 'card w-full max-w-sm p-6 sm:p-7 shadow-lg';
    modal.innerHTML = `
      <h2 class="text-base font-semibold">${escapeHtml(title)}</h2>
      <p class="muted text-sm mt-1">${escapeHtml(message)}</p>
      <input data-tid class="input mt-4" maxlength="300" autofocus
             value="${escapeHtml(initialValue)}"
             placeholder="e.g. RX-1234567890 or full URL" />
      <p data-err class="text-xs mt-1 hidden" style="color:#b91c1c">Tracking ID is required.</p>
      <div class="mt-5 flex justify-end gap-2">
        <button data-cancel class="btn btn-ghost">Cancel</button>
        <button data-ok class="btn btn-primary">${escapeHtml(confirmText)}</button>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const input = modal.querySelector('[data-tid]');
    const errEl = modal.querySelector('[data-err]');
    setTimeout(() => { input.focus(); input.select(); }, 50);

    function close(value) {
      backdrop.remove();
      resolve(value);
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
    modal.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    modal.querySelector('[data-ok]').addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) {
        errEl.classList.remove('hidden');
        input.focus();
        return;
      }
      close(v);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); modal.querySelector('[data-ok]').click(); }
      else if (e.key === 'Escape') { close(null); }
    });
  });
}

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      Failed to load order: ${escapeHtml(msg)}
    </div>`;
}
