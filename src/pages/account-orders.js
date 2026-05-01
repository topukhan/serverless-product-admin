import { isCustomerLoggedIn } from '../services/customer-auth.js';
import { getMyOrders } from '../services/customer-orders.js';
import { formatPrice } from '../services/products.js';
import { STATUS_META, ORDER_STATUSES } from '../services/orders.js';
import { escapeHtml, formatDate } from '../lib/dom.js';
import { AccountSubnav } from './_account-nav.js';

export async function AccountOrdersPage(params) {
  const root = document.createElement('section');
  root.className = 'container-x py-8 max-w-4xl';

  if (!isCustomerLoggedIn()) { location.hash = '#/login'; return root; }

  const status = (params?.query?.status || '').trim() || null;

  root.innerHTML = `
    <header class="mb-4">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">My orders</h1>
      <p class="muted text-sm mt-1">Track the status of every order you've placed.</p>
    </header>
  `;
  root.appendChild(AccountSubnav('orders'));

  const filterBar = document.createElement('div');
  filterBar.className = 'mt-4 flex gap-2 overflow-x-auto pb-1';
  filterBar.innerHTML = filterChip('All', null, status) +
    ORDER_STATUSES.map((s) => filterChip(STATUS_META[s].label, s, status)).join('');
  root.appendChild(filterBar);

  const list = document.createElement('div');
  list.className = 'mt-4 space-y-3';
  list.innerHTML = `<p class="muted text-sm">Loading…</p>`;
  root.appendChild(list);

  let rows = [];
  try { rows = await getMyOrders(status); }
  catch (err) {
    list.innerHTML = `<div class="card p-5">Failed to load: ${escapeHtml(err.message)}</div>`;
    return root;
  }

  if (rows.length === 0) {
    list.innerHTML = `
      <div class="card p-8 text-center">
        <p class="font-medium">No orders yet.</p>
        <p class="muted text-sm mt-1">Once you place an order, it will appear here.</p>
        <a href="#/products" class="btn btn-primary mt-4">Browse products</a>
      </div>`;
    return root;
  }

  list.innerHTML = rows.map((o) => {
    const s = STATUS_META[o.status] || { label: o.status, tone: '#000', bg: '#eee' };
    const unread = Number(o.unread_count || 0);
    const badge = unread > 0
      ? `<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
               style="background:#b91c1c;color:#fff">💬 ${unread}</span>`
      : '';
    return `
      <a href="#/account/orders/${encodeURIComponent(o.order_number)}"
         class="card p-4 sm:p-5 flex items-center gap-3 hover:shadow-md transition">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold">${escapeHtml(o.order_number)}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                  style="background:${s.bg};color:${s.tone}">${escapeHtml(s.label)}</span>
            ${badge}
          </div>
          <div class="text-xs muted mt-1">
            ${o.item_count} item${o.item_count === 1 ? '' : 's'} · placed ${formatDate(o.placed_at)}
          </div>
        </div>
        <div class="text-right">
          <div class="font-semibold">${formatPrice(o.total_amount)}</div>
          <div class="text-xs muted">View →</div>
        </div>
      </a>`;
  }).join('');

  return root;
}

function filterChip(label, value, current) {
  const isActive = (value || null) === (current || null);
  const href = value ? `#/account/orders?status=${value}` : `#/account/orders`;
  return `<a href="${href}"
             class="text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition"
             style="background:${isActive ? 'var(--color-primary)' : 'var(--color-surface)'};
                    color:${isActive ? '#fff' : 'var(--color-text)'};
                    border:1px solid var(--color-border)">${label}</a>`;
}
