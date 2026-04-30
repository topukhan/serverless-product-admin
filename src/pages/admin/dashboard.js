import { supabase } from '../../services/supabase.js';
import { getUser } from '../../services/auth.js';
import { escapeHtml } from '../../lib/dom.js';

export async function AdminDashboard() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8';

  const user = await getUser();

  // Counts in parallel.
  const [products, categories, reviews, questions, themes] = await Promise.all([
    countOf('products'),
    countOf('categories'),
    countOf('reviews'),
    countOf('questions'),
    countOf('themes'),
  ]);

  // Lowest-stock products (peek at fulfilment risk).
  const { data: lowStock } = await supabase
    .from('products')
    .select('id, name, stock')
    .order('stock', { ascending: true })
    .limit(5);

  // Latest 3 reviews.
  const { data: latestReviews } = await supabase
    .from('reviews')
    .select('id, user_name, rating, comment, created_at, product_id')
    .order('created_at', { ascending: false })
    .limit(3);

  root.innerHTML = `
    <header class="mb-8 flex items-end justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p class="muted text-sm mt-1">
          Signed in as <span class="font-medium">${escapeHtml(user?.email || '—')}</span>
        </p>
      </div>
      <a href="#/" class="btn btn-ghost text-sm">View public site →</a>
    </header>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      ${stat('Products',   products,   '#/admin/products')}
      ${stat('Categories', categories, '#/admin/categories')}
      ${stat('Reviews',    reviews,    '#/admin/reviews')}
      ${stat('Questions',  questions,  '#/admin/questions')}
      ${stat('Themes',     themes,     '#/admin/branding')}
    </div>

    <div class="mt-8 grid gap-6 lg:grid-cols-2">
      <div class="card p-5 sm:p-6">
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
        </div>
      </div>

      <div class="card p-5 sm:p-6">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Latest reviews</h2>
          <a href="#/admin/reviews" class="text-xs muted hover:underline">Moderate →</a>
        </div>
        <div class="mt-4">
          ${(latestReviews || []).length === 0
            ? `<p class="text-sm muted">No reviews yet.</p>`
            : `<ul class="space-y-3">
                 ${(latestReviews || []).map(reviewRow).join('')}
               </ul>`}
        </div>
      </div>
    </div>
  `;

  return root;
}

function stat(label, value, href) {
  return `
    <a href="${href}" class="card p-4 hover:shadow-md transition block">
      <div class="text-xs uppercase tracking-wider muted">${label}</div>
      <div class="mt-1 text-2xl font-semibold">${value}</div>
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

function reviewRow(r) {
  const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
  const when = new Date(r.created_at).toLocaleDateString();
  return `
    <li class="text-sm">
      <div class="flex items-center justify-between">
        <span class="font-medium">${escapeHtml(r.user_name)}</span>
        <span class="text-xs muted">${when}</span>
      </div>
      <div class="text-xs" style="color: var(--color-accent)">${stars}</div>
      ${r.comment ? `<p class="muted line-clamp-2 mt-0.5">${escapeHtml(r.comment)}</p>` : ''}
    </li>
  `;
}

async function countOf(table) {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}
