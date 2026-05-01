import { isCustomerLoggedIn } from '../services/customer-auth.js';
import { getMyOrderView } from '../services/customer-orders.js';
import { formatPrice } from '../services/products.js';
import { STATUS_META, ZONE_LABELS } from '../services/orders.js';
import { escapeHtml, formatDate } from '../lib/dom.js';
import { OrderChat } from '../components/order-chat.js';

export async function AccountOrderPage(params) {
  const root = document.createElement('section');
  root.className = 'container-x py-8 max-w-3xl';

  if (!isCustomerLoggedIn()) { location.hash = '#/login'; return root; }

  const orderNumber = decodeURIComponent(params.orderNumber);
  let order = null;
  try { order = await getMyOrderView(orderNumber); }
  catch (err) {
    root.innerHTML = `<div class="card p-6">Failed to load: ${escapeHtml(err.message)}</div>`;
    return root;
  }
  if (!order) {
    root.innerHTML = `
      <a href="#/account/orders" class="text-sm muted hover:underline">← My orders</a>
      <div class="card p-6 mt-3">
        <p class="font-medium">Order not found.</p>
        <p class="muted text-sm mt-1">It may belong to a different account.</p>
      </div>`;
    return root;
  }

  const s = STATUS_META[order.status] || { label: order.status, tone: '#000', bg: '#eee' };

  root.innerHTML = `
    <a href="#/account/orders" class="text-sm muted hover:underline">← My orders</a>
    <header class="mt-2 mb-5 flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">${escapeHtml(order.order_number)}</h1>
        <p class="muted text-sm mt-1">Placed ${formatDate(order.placed_at)}</p>
      </div>
      <span class="text-xs px-2.5 py-1 rounded-full font-medium"
            style="background:${s.bg};color:${s.tone}">${escapeHtml(s.label)}</span>
    </header>

    <div class="card p-5 sm:p-6">
      <h2 class="font-semibold mb-3">Items</h2>
      <div class="divide-y" style="border-color:var(--color-border)">
        ${(order.items || []).map((it) => `
          <div class="py-2.5 flex justify-between gap-3 text-sm">
            <div class="flex-1 min-w-0">
              <div class="font-medium line-clamp-2">${escapeHtml(it.product_name)}</div>
              <div class="text-xs muted">${formatPrice(it.product_price)} × ${it.quantity}</div>
            </div>
            <div class="font-medium shrink-0">${formatPrice(it.line_total)}</div>
          </div>
        `).join('')}
      </div>
      <dl class="mt-4 text-sm space-y-1.5">
        <div class="flex justify-between"><dt class="muted">Subtotal</dt><dd>${formatPrice(order.subtotal)}</dd></div>
        ${Number(order.discount_amount) > 0
          ? `<div class="flex justify-between"><dt class="muted">Discount</dt><dd>−${formatPrice(order.discount_amount)}</dd></div>` : ''}
        <div class="flex justify-between"><dt class="muted">Delivery${order.delivery_zone ? ` (${ZONE_LABELS[order.delivery_zone] || order.delivery_zone})` : ''}</dt><dd>${formatPrice(order.charge_amount)}</dd></div>
        <div class="flex justify-between font-semibold pt-2 border-t" style="border-color:var(--color-border)">
          <dt>Total</dt><dd style="color:var(--color-primary)">${formatPrice(order.total_amount)}</dd>
        </div>
      </dl>
    </div>

    <div class="grid sm:grid-cols-2 gap-4 mt-4">
      <div class="card p-5">
        <h3 class="font-semibold mb-2">Delivery</h3>
        <p class="text-sm">${escapeHtml(order.customer_name)}</p>
        <p class="text-sm muted">${escapeHtml(order.customer_phone)}</p>
        <p class="text-sm mt-1 whitespace-pre-wrap">${escapeHtml(order.customer_address)}</p>
        ${order.tracking_id
          ? `<p class="text-xs mt-3"><span class="muted">Tracking ID:</span> <span class="font-mono">${escapeHtml(order.tracking_id)}</span></p>` : ''}
      </div>
      <div class="card p-5">
        <h3 class="font-semibold mb-2">Status timeline</h3>
        <ol class="text-xs space-y-1.5">
          ${(order.events || []).map((e) => `
            <li class="flex gap-2">
              <span class="muted shrink-0">${formatDate(e.created_at)}</span>
              <span>${escapeHtml(e.note || (e.from_status ? `${e.from_status} → ${e.to_status}` : e.to_status))}</span>
            </li>`).join('') || '<li class="muted">No events.</li>'}
        </ol>
      </div>
    </div>

    <div data-chat-slot class="mt-4"></div>
  `;

  const chatSlot = root.querySelector('[data-chat-slot]');
  chatSlot.appendChild(OrderChat({ side: 'customer', orderNumber: order.order_number }));

  return root;
}
