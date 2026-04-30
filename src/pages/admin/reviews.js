import { getAdminReviews, deleteReview, setReviewEnabled } from '../../services/admin-reviews.js';
import { Toggle } from '../../components/toggle.js';
import { confirmDialog } from '../../components/dialog.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml, formatDate } from '../../lib/dom.js';

export async function AdminReviewsPage() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-3xl';

  let reviews = [];
  try {
    reviews = await getAdminReviews();
  } catch (e) {
    root.innerHTML = errorBox(e.message);
    return root;
  }

  let query = '';
  let ratingFilter = null; // null = all, otherwise 1..5

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Reviews</h1>
      <p class="muted text-sm mt-1" data-summary></p>
    </header>

    <div class="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
      <input data-search type="search" placeholder="Search by name, comment, product…"
             class="input sm:max-w-sm" />
      <div data-rating class="flex flex-wrap gap-1.5"></div>
    </div>

    <div data-list class="space-y-3"></div>
    <div data-empty class="hidden text-center py-14 rounded-lg"
         style="border:1px dashed var(--color-border); background: var(--color-surface)">
      <p class="font-medium" data-empty-title>No reviews yet</p>
      <p class="text-sm muted mt-1" data-empty-sub>Customer reviews will appear here.</p>
    </div>
  `;

  const summaryEl = root.querySelector('[data-summary]');
  const search    = root.querySelector('[data-search]');
  const ratingEl  = root.querySelector('[data-rating]');
  const listEl    = root.querySelector('[data-list]');
  const emptyEl   = root.querySelector('[data-empty]');
  const emptyTitle = root.querySelector('[data-empty-title]');
  const emptySub   = root.querySelector('[data-empty-sub]');

  function renderRatingChips() {
    const chips = [['All', null], ['5★', 5], ['4★', 4], ['3★', 3], ['2★', 2], ['1★', 1]];
    ratingEl.replaceChildren(...chips.map(([label, val]) => ratingChip(label, val)));
  }

  function ratingChip(label, val) {
    const active = ratingFilter === val;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = 'inline-flex items-center px-3 py-1 rounded-full text-xs transition';
    b.style.border = '1px solid ' + (active ? 'transparent' : 'var(--color-border)');
    b.style.background = active ? 'var(--color-primary)' : 'var(--color-surface)';
    b.style.color = active ? '#fff' : 'var(--color-text)';
    b.addEventListener('click', () => {
      ratingFilter = val;
      rerender();
    });
    return b;
  }

  function applyFilters(list) {
    let out = list;
    if (ratingFilter !== null) out = out.filter((r) => r.rating === ratingFilter);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        (r.user_name || '').toLowerCase().includes(q) ||
        (r.comment   || '').toLowerCase().includes(q) ||
        (r.product?.name || '').toLowerCase().includes(q)
      );
    }
    return out;
  }

  function rerender() {
    renderRatingChips();
    const filtered = applyFilters(reviews);

    if (reviews.length === 0) {
      summaryEl.textContent = 'No reviews yet';
    } else if (filtered.length === reviews.length) {
      summaryEl.textContent = `${reviews.length} review${reviews.length === 1 ? '' : 's'}`;
    } else {
      summaryEl.textContent = `${filtered.length} of ${reviews.length} matching`;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyTitle.textContent = reviews.length === 0 ? 'No reviews yet' : 'No matches';
      emptySub.textContent = reviews.length === 0
        ? 'Customer reviews will appear here.'
        : 'Try a different search or rating filter.';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.replaceChildren(...filtered.map((r) => reviewRow(r, {
      onDeleted: () => {
        reviews = reviews.filter((x) => x.id !== r.id);
        rerender();
      },
    })));
  }

  search.addEventListener('input', () => {
    query = search.value.trim();
    rerender();
  });

  rerender();
  return root;
}

function reviewRow(r, { onDeleted }) {
  const card = document.createElement('article');
  card.className = 'card p-5';

  function paint() {
    const initial = (r.user_name?.[0] || '?').toUpperCase();
    const stars = renderStars(r.rating);
    const dim = r.enabled === false ? 'opacity: 0.55;' : '';

    card.innerHTML = `
      <header class="flex items-start justify-between gap-4 flex-wrap" style="${dim}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white shrink-0"
               style="background: var(--color-primary)">${escapeHtml(initial)}</div>
          <div class="min-w-0">
            <div class="font-semibold truncate flex items-center gap-2">
              ${escapeHtml(r.user_name)}
              ${r.enabled === false
                ? `<span class="text-[11px] font-medium px-2 py-0.5 rounded-full"
                         style="background: var(--color-bg); color: var(--color-muted)">Hidden</span>`
                : ''}
            </div>
            <div class="text-xs muted mt-0.5">
              ${r.product?.id
                ? `<a href="#/product/${r.product.id}" class="hover:underline">${escapeHtml(r.product.name)}</a>`
                : `<span class="italic">deleted product</span>`}
              · ${formatDate(r.created_at)}
            </div>
          </div>
        </div>
        <div class="text-base" style="color: var(--color-accent)">${stars}</div>
      </header>
      <div style="${dim}">
        ${r.comment
          ? `<p class="mt-3 leading-relaxed">${escapeHtml(r.comment)}</p>`
          : `<p class="mt-3 muted text-sm italic">No comment</p>`}
      </div>
      <div class="mt-4 flex items-center justify-between gap-3">
        <label class="flex items-center gap-2 text-xs muted">
          <span data-toggle-slot></span>
          <span>Show on public site</span>
        </label>
        <button data-delete class="btn btn-ghost text-xs" style="color:#b91c1c">Delete</button>
      </div>
    `;

    const toggle = Toggle({
      initial: r.enabled !== false,
      ariaLabel: `Show review from ${r.user_name}`,
      onChange: async (next) => {
        try {
          await setReviewEnabled(r.id, next);
          r.enabled = next;
          showToast(next ? 'Review shown' : 'Review hidden', { variant: 'success' });
          paint();
        } catch (err) {
          showToast(err.message || 'Update failed', { variant: 'error' });
          throw err;
        }
      },
    });
    card.querySelector('[data-toggle-slot]').replaceWith(toggle.el);

    card.querySelector('[data-delete]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete this review?',
        message: `From "${r.user_name}" on ${r.product?.name || 'the product'}. This can't be undone. (To temporarily hide it, use the Show toggle instead.)`,
        confirmText: 'Delete review',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteReview(r.id);
        showToast('Review deleted', { variant: 'success' });
        onDeleted();
      } catch (err) {
        showToast(err.message || 'Delete failed', { variant: 'error' });
      }
    });
  }

  paint();
  return card;
}

function renderStars(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return '★'.repeat(r) + `<span style="color: var(--color-border)">${'☆'.repeat(5 - r)}</span>`;
}

function errorBox(msg) {
  return `<div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">Failed to load: ${escapeHtml(msg)}</div>`;
}
