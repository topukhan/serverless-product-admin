import { listOrders, getDashboardStats } from '../../services/admin-orders.js';
import { supabase } from '../../services/supabase.js';
import { ORDER_STATUSES } from '../../services/orders.js';
import { formatPrice } from '../../services/products.js';
import { statusBadge } from '../../components/status-badge.js';
import { escapeHtml } from '../../lib/dom.js';

const PAGE_SIZE = 30;

const DATE_PRESETS = [
  { key: 'today',      label: 'Today' },
  { key: 'last_7',     label: 'Last 7 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_30',    label: 'Last 30 days' },
  { key: 'last_90',    label: 'Last 90 days' },
  { key: 'all',        label: 'All time' },
];

function rangeFor(key) {
  const now = new Date();
  if (key === 'all') return { from: null, to: null };
  if (key === 'today') {
    const s = new Date(now); s.setHours(0,0,0,0);
    return { from: s.toISOString(), to: now.toISOString() };
  }
  if (key === 'this_month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: s.toISOString(), to: now.toISOString() };
  }
  const days = { last_7: 7, last_30: 30, last_90: 90 }[key] ?? 7;
  const s = new Date(now); s.setDate(s.getDate() - days); s.setHours(0,0,0,0);
  return { from: s.toISOString(), to: now.toISOString() };
}

export async function AdminOrdersListPage(params) {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8';

  const q = params?.query || {};
  let filterStatus = q.status || '';
  let filterSource = q.source || '';
  let datePreset   = q.preset || 'last_7';
  let { from: filterFrom, to: filterTo } = rangeFor(datePreset);
  let searchTerm = '';
  let offset = 0;

  root.innerHTML = `
    <header class="mb-5 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Orders</h1>
        <p class="muted text-sm mt-1" data-summary></p>
      </div>
      <a href="#/admin/orders/new" class="btn btn-primary text-sm">+ New order</a>
    </header>

    <div class="card p-4 sm:p-5 mb-5 space-y-3">
      <input data-search class="input text-sm" maxlength="60"
             placeholder="Search by order #, phone, name, or tracking ID…" />

      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label class="flex items-center gap-2">
          <span class="muted text-xs uppercase tracking-wider">Date</span>
          <select data-date class="input text-sm py-1.5" style="width:auto">
            ${DATE_PRESETS.map((p) =>
              `<option value="${p.key}" ${p.key === datePreset ? 'selected' : ''}>${p.label}</option>`
            ).join('')}
          </select>
        </label>

        <div class="flex items-center gap-2">
          <span class="muted text-xs uppercase tracking-wider">Source</span>
          <div class="inline-flex rounded-full overflow-hidden" data-source-seg
               style="border:1px solid var(--color-border)">
            ${[
              { k: '',         l: 'All' },
              { k: 'customer', l: 'Customer' },
              { k: 'admin',    l: 'Admin' },
            ].map((o) => `
              <button type="button" data-source="${o.k}"
                      class="px-3 py-1 text-xs transition"
                      style="background:${o.k === filterSource ? 'var(--color-primary)' : 'transparent'};
                             color:${o.k === filterSource ? '#fff' : 'var(--color-text)'}">${o.l}</button>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 items-center pt-1" data-status-pills></div>
    </div>

    <div data-list class="space-y-2"></div>
    <div data-pager class="mt-6 flex items-center justify-between text-sm muted"></div>
  `;

  const summaryEl = root.querySelector('[data-summary]');
  const listEl = root.querySelector('[data-list]');
  const pagerEl = root.querySelector('[data-pager]');
  const pillsEl = root.querySelector('[data-status-pills]');
  const searchEl = root.querySelector('[data-search]');
  const dateEl  = root.querySelector('[data-date]');
  const sourceEl = root.querySelector('[data-source-seg]');

  dateEl.addEventListener('change', () => {
    datePreset = dateEl.value;
    const r = rangeFor(datePreset);
    filterFrom = r.from; filterTo = r.to;
    offset = 0;
    reload(); reloadCounts();
  });

  sourceEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-source]');
    if (!btn) return;
    filterSource = btn.dataset.source;
    offset = 0;
    paintSourceSeg();
    reload(); reloadCounts();
  });

  function paintSourceSeg() {
    sourceEl.querySelectorAll('[data-source]').forEach((b) => {
      const active = b.dataset.source === filterSource;
      b.style.background = active ? 'var(--color-primary)' : 'transparent';
      b.style.color = active ? '#fff' : 'var(--color-text)';
    });
  }

  function paintPills(counts = {}) {
    const pills = [
      { key: '', label: 'All', count: Object.values(counts).reduce((s, c) => s + (c.count || 0), 0) },
      ...ORDER_STATUSES.map((s) => ({
        key: s, label: capitalize(s), count: counts[s]?.count || 0,
      })),
    ];
    pillsEl.innerHTML = pills.map((p) => {
      const active = p.key === filterStatus;
      return `
        <button data-pill="${p.key}"
                class="text-xs px-3 py-1.5 rounded-full transition"
                style="border:1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'};
                       background:${active ? 'var(--color-primary)' : 'var(--color-surface)'};
                       color:${active ? '#fff' : 'var(--color-text)'}">
          ${escapeHtml(p.label)}
          <span class="ml-1 opacity-80">${p.count}</span>
        </button>
      `;
    }).join('');
    pillsEl.querySelectorAll('[data-pill]').forEach((b) => {
      b.addEventListener('click', () => {
        filterStatus = b.dataset.pill;
        offset = 0;
        reload();
        paintPills(lastCounts);
      });
    });
  }

  let lastCounts = {};
  async function reloadCounts() {
    try {
      const stats = await getDashboardStats({ from: filterFrom, to: filterTo });
      lastCounts = stats.by_status || {};
      paintPills(lastCounts);
    } catch {
      paintPills({});
    }
  }

  let searchTimer = null;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTerm = searchEl.value;
      offset = 0;
      reload();
    }, 280);
  });

  async function reload() {
    listEl.innerHTML = `<div class="muted text-sm">Loading…</div>`;
    try {
      const { rows, total } = await listOrders({
        status: filterStatus || null,
        source: filterSource || null,
        q: searchTerm || null,
        from: filterFrom,
        to: filterTo,
        limit: PAGE_SIZE,
        offset,
      });
      summaryEl.textContent = total === 0
        ? 'No orders match your filters.'
        : `${total} order${total === 1 ? '' : 's'}`;
      if (rows.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-14 rounded-lg"
               style="border:1px dashed var(--color-border); background: var(--color-surface)">
            <p class="font-medium">No orders found</p>
            <p class="text-sm muted mt-1">Try adjusting filters or the date range.</p>
          </div>`;
      } else {
        const ids = rows.map((r) => r.id);
        const unreadMap = await fetchUnreadMap(ids);
        listEl.replaceChildren(...rows.map((o) => orderRow(o, unreadMap.get(o.id) || 0)));
      }
      pagerEl.innerHTML = renderPager(total);
      pagerEl.querySelector('[data-prev]')?.addEventListener('click', () => {
        offset = Math.max(0, offset - PAGE_SIZE); reload();
      });
      pagerEl.querySelector('[data-next]')?.addEventListener('click', () => {
        offset = offset + PAGE_SIZE; reload();
      });
    } catch (err) {
      listEl.innerHTML = `
        <div class="p-4 rounded-lg" style="background:#fef2f2;color:#991b1b">
          ${escapeHtml(err.message || 'Failed to load orders')}
        </div>`;
    }
  }

  function renderPager(total) {
    if (total <= PAGE_SIZE) return '';
    const page = Math.floor(offset / PAGE_SIZE) + 1;
    const last = Math.ceil(total / PAGE_SIZE);
    return `
      <span>Page ${page} of ${last}</span>
      <span class="flex gap-2">
        <button data-prev class="btn btn-ghost text-xs" ${offset === 0 ? 'disabled' : ''}>Prev</button>
        <button data-next class="btn btn-ghost text-xs" ${offset + PAGE_SIZE >= total ? 'disabled' : ''}>Next</button>
      </span>
    `;
  }

  paintSourceSeg();
  await reloadCounts();
  await reload();
  return root;
}

async function fetchUnreadMap(orderIds) {
  const map = new Map();
  if (!orderIds.length) return map;
  const { data, error } = await supabase
    .from('order_messages')
    .select('order_id')
    .in('order_id', orderIds)
    .eq('sender_role', 'customer')
    .is('read_by_admin_at', null);
  if (error) return map;
  for (const row of data || []) {
    map.set(row.order_id, (map.get(row.order_id) || 0) + 1);
  }
  return map;
}

function orderRow(o, unread = 0) {
  const isNew = o.status === 'pending' && !o.viewed_at;
  const row = document.createElement('a');
  row.href = `#/admin/orders/${o.id}`;
  row.className = 'card p-4 flex items-center gap-4 hover:shadow-sm transition';
  if (isNew) row.style.borderColor = '#b91c1c';
  const placed = new Date(o.placed_at).toLocaleString();
  row.innerHTML = `
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="font-mono font-medium">${escapeHtml(o.order_number)}</span>
        ${statusBadge(o.status)}
        ${sourceBadge(o.source)}
        ${isNew
          ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style="background:#b91c1c;color:#fff">NEW</span>`
          : ''}
        ${unread > 0
          ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style="background:#1d4ed8;color:#fff" title="Unread customer messages">💬 ${unread}</span>`
          : ''}
        ${o.tracking_id
          ? `<span class="text-[11px] muted">→ <span class="font-mono">${escapeHtml(o.tracking_id)}</span></span>`
          : ''}
      </div>
      <div class="text-sm mt-0.5">
        <span class="font-medium">${escapeHtml(o.customer_name)}</span>
        <span class="muted"> · ${escapeHtml(o.customer_phone)}</span>
      </div>
      <div class="text-xs muted mt-0.5">${placed}</div>
    </div>
    <div class="text-right">
      <div class="font-semibold" style="color:var(--color-primary)">
        ${formatPrice(o.total_amount)}
      </div>
    </div>
  `;
  return row;
}

function sourceBadge(source) {
  if (source === 'admin') {
    return `<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style="background:#ede9fe;color:#5b21b6">Admin</span>`;
  }
  return `<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style="background:#e0f2fe;color:#075985">Customer</span>`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
