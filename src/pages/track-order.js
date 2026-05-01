import { findOrder } from '../services/orders.js';
import { navigate } from '../services/router.js';
import { showToast } from '../components/toast.js';
import { getRecentOrders, pushRecentOrder } from '../lib/recent-orders.js';
import { escapeHtml } from '../lib/dom.js';

export async function TrackOrderPage(params) {
  const root = document.createElement('section');
  root.className = 'container-x py-12';

  const initial = params?.query?.q || '';
  const recent = getRecentOrders();

  root.innerHTML = `
    <div class="max-w-md mx-auto text-center">
      <div class="mx-auto w-14 h-14 rounded-full inline-flex items-center justify-center"
           style="background:var(--color-primary-soft);color:var(--color-primary)">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-3.5-3.5"/>
        </svg>
      </div>
      <h1 class="mt-5 text-2xl sm:text-3xl font-bold tracking-tight">Track your order</h1>
      <p class="muted mt-2 text-sm">
        Enter your order ID to check its current status.
      </p>

      <form data-form class="mt-6 flex gap-2">
        <input data-q class="input" required maxlength="60"
               placeholder="e.g. ORD-001234"
               value="${initial.replace(/"/g, '&quot;')}" />
        <button type="submit" class="btn btn-primary">Track</button>
      </form>

      <p data-err class="mt-3 text-sm hidden" style="color:#b91c1c"></p>

      ${recent.length > 0 ? `
        <div class="mt-8 text-left">
          <div class="text-xs uppercase tracking-wider muted mb-2">Your recent orders</div>
          <div class="flex flex-wrap gap-2" data-recent>
            ${recent.map((o) => `
              <a href="#/order/${escapeHtml(o)}"
                 class="font-mono text-xs px-3 py-1.5 rounded-full transition hover:shadow-sm"
                 style="border:1px solid var(--color-border); background:var(--color-surface)">
                ${escapeHtml(o)}
              </a>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <p class="text-xs muted mt-8">
        Anyone with the order ID can see the order. Keep it safe.
      </p>
    </div>
  `;

  const form = root.querySelector('[data-form]');
  const input = root.querySelector('[data-q]');
  const errEl = root.querySelector('[data-err]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    errEl.classList.add('hidden');

    try {
      const num = await findOrder(q);
      if (num) {
        pushRecentOrder(num);
        navigate(`/order/${num}`);
      } else {
        errEl.textContent = 'No order matched that ID.';
        errEl.classList.remove('hidden');
      }
    } catch (err) {
      showToast(err.message || 'Search failed', { variant: 'error' });
    }
  });

  // Auto-search if a ?q= param is present.
  if (initial) {
    form.requestSubmit();
  }

  return root;
}
