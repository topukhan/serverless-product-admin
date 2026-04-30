import { listOrders, getDashboardStats } from '../../services/admin-orders.js';
import { ORDER_STATUSES } from '../../services/orders.js';
import { formatPrice } from '../../services/products.js';
import { DateRange } from '../../components/date-range.js';
import { statusBadge } from '../../components/status-badge.js';
import { escapeHtml } from '../../lib/dom.js';

const PAGE_SIZE = 30;

export async function AdminOrdersListPage(params) {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8';

  // Pull initial filters from query string so dashboard "click a card"
  // navigation works.
  const q = params?.query || {};
  let filterStatus = q.status || '';
  let filterFrom = q.from || null;
  let filterTo = q.to || null;
  let searchTerm = '';
  let offset = 0;

  root.innerHTML = `
    <header class="mb-6 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Orders</h1>
        <p class="muted text-sm mt-1" data-summary></p>
      </div>
    </header>

    <div class="card p-4 sm:p-5 mb-5">
      <div data-date></div>
      <div class="mt-4 flex flex-wrap gap-2 items-center" data-status-pills></div>
      <div class="mt-4">
        <input data-search class="input text-sm" maxlength="60"
               placeholder="Search by order #, phone, name, or tracking ID…" />
      </div>
    </div>

    <div data-list class="space-y-2"></div>
    <div data-pager class="mt-6 flex items-center justify-between text-sm muted"></div>
  `;

  const summaryEl = root.querySelector('[data-summary]');
  const listEl = root.querySelector('[data-list]');
  const pagerEl = root.querySelector('[data-pager]');
  const dateSlot = root.querySelector('[data-date]');
  const pillsEl = root.querySelector('[data-status-pills]');
  const searchEl = root.querySelector('[data-search]');

  /* Date range. */
  const initialPreset = filterFrom && filterTo ? 'custom' : 'last_30';
  const dr = DateRange({
    initial: initialPreset,
    initialFrom: filterFrom,
    initialTo: filterTo,
    onChange: ({ from, to }) => {
      filterFrom = from;
      filterTo = to;
      offset = 0;
      reload();
      reloadCounts();
    },
  });
  dateSlot.appendChild(dr.el);

  /* Status pills. */
  function paintPills(counts = {}) {
    const pills = [
      { key: '',          label: 'All',       count: Object.values(counts).reduce((s, c) => s + (c.count || 0), 0) },
      ...ORDER_STATUSES.map((s) => ({
        key: s,
        label: capitalize(s),
        count: counts[s]?.count || 0,
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
    } catch (err) {
      // Pills still render with zeros — non-fatal.
      paintPills({});
    }
  }

  /* Search debounce. */
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
        listEl.replaceChildren(...rows.map(orderRow));
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

  await reloadCounts();
  await reload();
  return root;
}

function orderRow(o) {
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
        ${isNew
          ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style="background:#b91c1c;color:#fff">NEW</span>`
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

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
