import { supabase } from '../../services/supabase.js';
import { getUser } from '../../services/auth.js';
import { getDashboardStats } from '../../services/admin-orders.js';
import { STATUS_META } from '../../services/orders.js';
import { formatPrice } from '../../services/products.js';
import { DateRange } from '../../components/date-range.js';
import { escapeHtml } from '../../lib/dom.js';

export async function AdminDashboard() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8';

  const user = await getUser();

  let currentRange = { from: null, to: null };

  root.innerHTML = `
    <header class="mb-6 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p class="muted text-sm mt-1">
          Signed in as <span class="font-medium">${escapeHtml(user?.email || '—')}</span>
        </p>
      </div>
      <a href="#/" class="btn btn-ghost text-sm">View public site →</a>
    </header>

    <div class="card p-4 sm:p-5 mb-6 flex flex-wrap items-center gap-4 justify-between">
      <div>
        <div class="text-sm font-medium">Order metrics</div>
        <div class="text-xs muted mt-0.5">Filter the cards by date range.</div>
      </div>
      <div data-date></div>
    </div>

    <div data-cards class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"></div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <div data-low-stock class="card p-5 sm:p-6"></div>
      <div data-counts class="card p-5 sm:p-6"></div>
    </div>
  `;

  const dateSlot = root.querySelector('[data-date]');
  const cardsEl  = root.querySelector('[data-cards]');
  const lowEl    = root.querySelector('[data-low-stock]');
  const countsEl = root.querySelector('[data-counts]');

  const dr = DateRange({
    initial: 'last_30',
    onChange: ({ from, to }) => {
      currentRange = { from, to };
      reloadCards();
    },
  });
  dateSlot.appendChild(dr.el);
  currentRange = dr.getValue();

  /* Static side panels (don't depend on the date filter). */
  Promise.all([
    supabase.from('products').select('id, name, stock').order('stock', { ascending: true }).limit(5),
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
    supabase.from('reviews').select('*', { count: 'exact', head: true }),
    supabase.from('questions').select('*', { count: 'exact', head: true }),
  ]).then(([{ data: lowStock }, products, categories, reviews, questions]) => {
    lowEl.innerHTML = `
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">Low stock</h2>
        <a href="#/admin/products" class="text-xs muted hover:underline">Manage →</a>
      </div>
      <div class="mt-4">
        ${(lowStock || []).length === 0
          ? `<p class="text-sm muted">No products yet.</p>`
          : `<ul class="divide-y" style="border-color: var(--color-border)">
               ${(lowStock || []).map(lowStockRow).join('')}
             </ul>`}
      </div>`;

    countsEl.innerHTML = `
      <div class="flex items-center justify-between">
        <h2 class="font-semibold">Catalog</h2>
      </div>
      <dl class="mt-4 grid grid-cols-2 gap-3 text-sm">
        ${miniCount('Products',   products.count   ?? 0, '#/admin/products')}
        ${miniCount('Categories', categories.count ?? 0, '#/admin/categories')}
        ${miniCount('Reviews',    reviews.count    ?? 0, '#/admin/reviews')}
        ${miniCount('Questions',  questions.count  ?? 0, '#/admin/questions')}
      </dl>`;
  }).catch(() => {});

  await reloadCards();

  async function reloadCards() {
    cardsEl.innerHTML = `<div class="muted text-sm col-span-full">Loading…</div>`;
    try {
      const stats = await getDashboardStats(currentRange);
      const by = stats.by_status || {};
      const params = new URLSearchParams();
      if (currentRange.from) params.set('from', currentRange.from);
      if (currentRange.to)   params.set('to', currentRange.to);
      const qs = params.toString();
      const linkFor = (status) => `#/admin/orders?${qs ? qs + '&' : ''}status=${status}`;

      const tiles = [
        ['approved',  'Approved orders'],
        ['delivered', 'Delivered orders'],
        ['cancelled', 'Cancelled orders'],
      ].map(([key, label]) =>
        statTile(label, by[key], STATUS_META[key], linkFor(key))
      );
      const secondary = [
        ['pending',  'Pending'],
        ['shipped',  'Shipped'],
        ['returned', 'Returned'],
      ].map(([key, label]) => smallTile(label, by[key], STATUS_META[key], linkFor(key)));

      cardsEl.innerHTML = tiles.join('') + secondary.join('');
    } catch (err) {
      cardsEl.innerHTML = `
        <div class="col-span-full p-4 rounded-lg" style="background:#fef2f2;color:#991b1b">
          ${escapeHtml(err.message || 'Failed to load stats')}
        </div>`;
    }
  }

  return root;
}

function statTile(label, slice, meta, href) {
  const count = slice?.count || 0;
  const total = Number(slice?.total || 0);
  return `
    <a href="${href}" class="card p-5 hover:shadow-md transition block">
      <div class="flex items-center justify-between">
        <span class="text-xs uppercase tracking-wider muted">${escapeHtml(label)}</span>
        <span class="inline-block w-2.5 h-2.5 rounded-full"
              style="background:${meta.tone}"></span>
      </div>
      <div class="mt-3 text-2xl font-semibold" style="color:var(--color-primary)">
        ${formatPrice(total)}
      </div>
      <div class="mt-1 text-xs muted">${count} order${count === 1 ? '' : 's'}</div>
    </a>
  `;
}

function smallTile(label, slice, meta, href) {
  const count = slice?.count || 0;
  return `
    <a href="${href}" class="card p-4 flex items-center justify-between hover:shadow-sm transition">
      <div class="flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full" style="background:${meta.tone}"></span>
        <span class="text-sm">${escapeHtml(label)}</span>
      </div>
      <div class="text-sm font-semibold">${count}</div>
    </a>
  `;
}

function miniCount(label, value, href) {
  return `
    <a href="${href}" class="rounded-md p-3 hover:shadow-sm transition block"
       style="background:var(--color-bg)">
      <div class="text-xs uppercase tracking-wider muted">${label}</div>
      <div class="text-xl font-semibold mt-0.5">${value}</div>
    </a>
  `;
}

function lowStockRow(p) {
  const tone = p.stock <= 0
    ? 'color:#b91c1c'
    : p.stock < 5 ? 'color:#92400e' : 'color: var(--color-muted)';
  return `
    <li class="py-2.5 flex items-center justify-between">
      <a href="#/admin/products" class="text-sm hover:underline">${escapeHtml(p.name)}</a>
      <span class="text-xs font-medium" style="${tone}">${p.stock} in stock</span>
    </li>
  `;
}
