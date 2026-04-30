import { getOrderView, STATUS_META, ZONE_LABELS } from '../services/orders.js';
import { formatPrice } from '../services/products.js';
import { getBranding } from '../services/branding.js';
import { escapeHtml } from '../lib/dom.js';

export async function OrderViewPage(params) {
  const root = document.createElement('section');
  root.className = 'container-x py-10';

  const orderNumber = params.orderNumber;
  const fresh = params.query?.fresh === '1';

  let order;
  try {
    order = await getOrderView(orderNumber);
  } catch (err) {
    root.innerHTML = errorBox(err.message);
    return root;
  }
  if (!order) {
    root.innerHTML = `
      <div class="text-center py-20">
        <div class="mx-auto w-14 h-14 rounded-full inline-flex items-center justify-center"
             style="background:var(--color-primary-soft);color:var(--color-primary)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-3.5-3.5"/>
          </svg>
        </div>
        <h1 class="mt-5 text-2xl font-bold tracking-tight">Order not found</h1>
        <p class="muted mt-2">No order matches <code>${escapeHtml(orderNumber)}</code>.</p>
        <a href="#/track-order" class="btn btn-primary mt-6">Search again</a>
      </div>`;
    return root;
  }

  root.appendChild(InvoiceCard(order));

  if (fresh) {
    showThankYouPopup(order, () => {
      // Strip ?fresh=1 from the URL so a refresh / back doesn't re-open it.
      const cleanHash = `#/order/${order.order_number}`;
      history.replaceState(null, '', cleanHash);
    });
  }

  return root;
}

function InvoiceCard(order) {
  const wrap = document.createElement('div');
  wrap.className = 'max-w-3xl mx-auto';

  const brand = getBranding();
  const meta = STATUS_META[order.status] || STATUS_META.pending;
  const placed = new Date(order.placed_at).toLocaleString();

  wrap.innerHTML = `
    <div class="flex items-center justify-between mb-5 print-hide">
      <a href="#/track-order" class="text-sm muted hover:underline">← Track another order</a>
    </div>

    <article id="invoice" class="card p-6 sm:p-10">
      <header class="flex flex-wrap items-start justify-between gap-4 pb-6 border-b"
              style="border-color:var(--color-border)">
        <div>
          <div class="text-2xl font-bold tracking-tight">${escapeHtml(brand.site_name || 'Invoice')}</div>
          <div class="text-xs muted mt-1">Cash on delivery</div>
        </div>
        <div class="text-right">
          <div class="text-xs uppercase muted tracking-wider">Order</div>
          <div class="font-mono font-semibold mt-0.5">${escapeHtml(order.order_number)}</div>
          <div class="text-xs muted mt-1">${escapeHtml(placed)}</div>
        </div>
      </header>

      <section class="grid sm:grid-cols-2 gap-4 mt-6 text-sm">
        <div>
          <div class="text-xs uppercase muted tracking-wider mb-1">Bill to</div>
          <div class="font-medium">${escapeHtml(order.customer_name)}</div>
          <div class="muted">${escapeHtml(order.customer_phone)}</div>
          <div class="muted whitespace-pre-line">${escapeHtml(order.customer_address)}</div>
          ${order.delivery_zone
            ? `<div class="muted mt-1 text-xs">Delivery: <span class="font-medium">${escapeHtml(zoneLabel(order.delivery_zone))}</span></div>`
            : ''}
          ${order.customer_note
            ? `<div class="muted mt-1"><span class="font-medium">Note:</span> ${escapeHtml(order.customer_note)}</div>`
            : ''}
        </div>
        <div class="sm:text-right">
          <div class="text-xs uppercase muted tracking-wider mb-1">Status</div>
          <span class="inline-block text-xs font-medium px-2.5 py-1 rounded-full"
                style="background:${meta.bg};color:${meta.tone}">
            ${meta.label}
          </span>
          ${order.tracking_id
            ? `<div class="mt-2 text-xs">
                 <span class="muted">Tracking:</span>
                 <span class="font-mono">${escapeHtml(order.tracking_id)}</span>
               </div>`
            : ''}
        </div>
      </section>

      <section class="mt-8">
        <table class="w-full text-sm">
          <thead class="text-xs uppercase muted tracking-wider">
            <tr class="border-b" style="border-color:var(--color-border)">
              <th class="text-left py-2 font-medium">Item</th>
              <th class="text-right py-2 font-medium">Price</th>
              <th class="text-right py-2 font-medium">Qty</th>
              <th class="text-right py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map((it) => `
              <tr class="border-b" style="border-color:var(--color-border)">
                <td class="py-3">
                  <div class="font-medium">${escapeHtml(it.product_name)}</div>
                  ${it.product_id
                    ? `<div class="text-[11px] muted font-mono">${it.product_id.slice(0, 8)}</div>`
                    : `<div class="text-[11px] muted">(product removed)</div>`}
                </td>
                <td class="py-3 text-right">${formatPrice(it.product_price)}</td>
                <td class="py-3 text-right">${it.quantity}</td>
                <td class="py-3 text-right font-medium">${formatPrice(it.line_total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>

      <section class="mt-6 ml-auto sm:max-w-xs">
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="muted">Subtotal</dt><dd>${formatPrice(order.subtotal)}</dd></div>
          ${Number(order.discount_amount) > 0
            ? `<div class="flex justify-between"><dt class="muted">Discount</dt><dd>− ${formatPrice(order.discount_amount)}</dd></div>`
            : ''}
          <div class="flex justify-between"><dt class="muted">Delivery / charge</dt><dd>${formatPrice(order.charge_amount)}</dd></div>
        </dl>
        <div class="mt-3 pt-3 border-t flex justify-between items-baseline"
             style="border-color:var(--color-border)">
          <span class="font-semibold">Total</span>
          <span class="text-xl font-semibold" style="color:var(--color-primary)">
            ${formatPrice(order.total_amount)}
          </span>
        </div>
      </section>

      ${(order.events || []).length > 0
        ? `<section class="mt-8 print-hide">
             <div class="text-xs uppercase muted tracking-wider mb-3">Status history</div>
             <ol class="space-y-2 text-sm">
               ${order.events.map((ev) => `
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
           </section>`
        : ''}

      <footer class="mt-10 text-xs muted text-center print-only-block">
        Thank you for shopping with ${escapeHtml(brand.site_name || 'us')}.
      </footer>
    </article>
  `;

  return wrap;
}

function showThankYouPopup(order, onClose) {
  const backdrop = document.createElement('div');
  backdrop.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 print-hide';
  backdrop.style.background = 'rgb(15 17 13 / 0.45)';
  backdrop.style.backdropFilter = 'blur(4px)';
  backdrop.style.opacity = '0';
  backdrop.style.transition = 'opacity 160ms ease-out';

  const modal = document.createElement('div');
  modal.className = 'card w-full max-w-sm p-6 sm:p-7 shadow-lg text-center';
  modal.style.transform = 'scale(0.96) translateY(6px)';
  modal.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';

  modal.innerHTML = `
    <div class="mx-auto w-12 h-12 rounded-full inline-flex items-center justify-center"
         style="background: var(--color-primary-soft); color: var(--color-primary)">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h2 class="mt-4 text-xl font-semibold">Thank you for your order!</h2>
    <p class="muted text-sm mt-1">
      Order <span class="font-mono font-medium">${escapeHtml(order.order_number)}</span>
      placed successfully. Save the order ID — you can track or download the
      invoice anytime.
    </p>
    <div class="mt-6">
      <button data-view class="btn btn-primary w-full">View invoice</button>
    </div>
  `;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    modal.style.transform = 'scale(1) translateY(0)';
  });

  function close() {
    backdrop.style.opacity = '0';
    modal.style.transform = 'scale(0.96) translateY(6px)';
    setTimeout(() => {
      backdrop.remove();
      document.body.style.overflow = prevOverflow;
      onClose?.();
    }, 180);
  }

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  modal.querySelector('[data-view]').addEventListener('click', close);
}

function zoneLabel(zone) {
  const b = getBranding();
  if (zone === 'inside_dhaka')  return b.delivery_label_inside_dhaka  || ZONE_LABELS.inside_dhaka;
  if (zone === 'outside_dhaka') return b.delivery_label_outside_dhaka || ZONE_LABELS.outside_dhaka;
  return ZONE_LABELS[zone] || zone;
}

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg max-w-2xl mx-auto" style="background:#fef2f2;color:#991b1b">
      Failed to load order: ${escapeHtml(msg)}
    </div>`;
}
