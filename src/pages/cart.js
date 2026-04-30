import { getCart, setQty, removeFromCart, clearCart, onCartChange } from '../services/cart.js';
import { supabase } from '../services/supabase.js';
import { formatPrice } from '../services/products.js';
import { getFlag } from '../services/branding.js';
import { confirmDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../lib/dom.js';

export async function CartPage() {
  const root = document.createElement('section');
  root.className = 'container-x py-10';

  const items = getCart();
  if (items.length === 0) {
    root.appendChild(emptyState());
    return root;
  }

  // Hydrate cart items with product data.
  const ids = items.map((i) => i.productId);
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, price, image_url, stock')
    .in('id', ids);

  if (error) {
    root.innerHTML = `
      <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
        Failed to load cart: ${escapeHtml(error.message)}
      </div>`;
    return root;
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  // Drop any cart entries whose product no longer exists.
  const valid = items.filter((it) => byId.has(it.productId));
  if (valid.length !== items.length) {
    items
      .filter((it) => !byId.has(it.productId))
      .forEach((it) => removeFromCart(it.productId));
  }

  const heading = document.createElement('header');
  heading.className = 'mb-8 flex items-end justify-between flex-wrap gap-3';
  heading.innerHTML = `
    <div>
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight">Your cart</h1>
      <p class="mt-1 muted text-sm" data-summary></p>
    </div>
    <button data-clear class="btn btn-ghost text-sm">Clear cart</button>
  `;
  root.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'grid lg:grid-cols-[1fr_360px] gap-8 items-start';
  root.appendChild(grid);

  const list = document.createElement('div');
  list.className = 'card divide-y';
  list.style.borderColor = 'var(--color-border)';
  grid.appendChild(list);

  const summary = document.createElement('aside');
  summary.className = 'card p-5 sm:p-6 lg:sticky lg:top-20';
  grid.appendChild(summary);

  const summaryEl = heading.querySelector('[data-summary]');
  heading.querySelector('[data-clear]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear your cart?',
      message: 'This will remove all items from your cart. You can always add them back later.',
      confirmText: 'Clear cart',
      cancelText: 'Keep items',
      variant: 'danger',
    });
    if (ok) {
      clearCart();
      showToast('Cart cleared');
    }
  });

  function render() {
    const current = getCart().filter((it) => byId.has(it.productId));
    if (current.length === 0) {
      root.replaceChildren(emptyState());
      return;
    }

    const total = current.reduce(
      (s, it) => s + Number(byId.get(it.productId).price) * it.qty,
      0
    );
    const itemCount = current.reduce((s, it) => s + it.qty, 0);

    summaryEl.textContent = `${itemCount} item${itemCount === 1 ? '' : 's'}`;

    list.replaceChildren(...current.map((it) => CartRow(it, byId.get(it.productId))));

    summary.innerHTML = `
      <div class="text-sm font-semibold">Order summary</div>
      <dl class="mt-4 space-y-2 text-sm">
        <div class="flex justify-between"><dt class="muted">Items</dt><dd>${itemCount}</dd></div>
        <div class="flex justify-between"><dt class="muted">Subtotal</dt><dd>${formatPrice(total)}</dd></div>
        <div class="flex justify-between"><dt class="muted">Shipping</dt><dd class="muted">Calculated at checkout</dd></div>
      </dl>
      <div class="mt-4 pt-4 border-t flex justify-between items-baseline divider"
           style="border-color:var(--color-border)">
        <span class="font-semibold">Total</span>
        <span class="text-xl font-semibold" style="color:var(--color-primary)">
          ${formatPrice(total)}
        </span>
      </div>
      <a href="#/checkout" class="btn btn-primary w-full mt-5">
        Checkout
      </a>
      <p class="mt-2 text-xs muted text-center">
        Cash on delivery. No account needed.
      </p>
    `;
  }

  render();
  onCartChange(render);
  return root;
}

function CartRow(item, product) {
  const row = document.createElement('div');
  row.className = 'p-4 sm:p-5 flex items-start gap-4';
  row.innerHTML = `
    <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-md overflow-hidden flex-shrink-0"
         style="background: var(--color-bg)">
      ${product.image_url
        ? `<img src="${product.image_url}" alt="" class="w-full h-full object-cover" />`
        : `<div class="w-full h-full flex items-center justify-center muted text-xs">No image</div>`}
    </div>
    <div class="flex-1 min-w-0">
      <a href="#/product/${product.id}" class="font-medium hover:underline line-clamp-1">
        ${escapeHtml(product.name)}
      </a>
      <div class="text-sm muted mt-0.5">${formatPrice(product.price)} each</div>
      <div class="mt-3 flex items-center gap-3">
        <div class="inline-flex items-center rounded-md overflow-hidden"
             style="border: 1px solid var(--color-border)">
          <button data-dec aria-label="Decrease"
                  class="w-8 h-8 hover:bg-[color:var(--color-primary-soft)]">−</button>
          <span data-qty class="w-9 text-center text-sm">${item.qty}</span>
          <button data-inc aria-label="Increase"
                  class="w-8 h-8 hover:bg-[color:var(--color-primary-soft)]"
                  ${item.qty >= product.stock ? 'disabled' : ''}>+</button>
        </div>
        <button data-remove class="text-xs muted hover:text-[color:var(--color-text)]">
          Remove
        </button>
      </div>
    </div>
    <div class="text-right">
      <div class="font-semibold" style="color: var(--color-primary)">
        ${formatPrice(Number(product.price) * item.qty)}
      </div>
      ${product.stock < item.qty
        ? `<div class="text-xs mt-1" style="color:#b45309">${
            getFlag('show_stock')
              ? `Only ${product.stock} in stock`
              : 'Limited stock'
          }</div>`
        : ''}
    </div>
  `;
  row.querySelector('[data-dec]').addEventListener('click', () => setQty(product.id, item.qty - 1));
  row.querySelector('[data-inc]').addEventListener('click', () => setQty(product.id, item.qty + 1));
  row.querySelector('[data-remove]').addEventListener('click', () => removeFromCart(product.id));
  return row;
}

function emptyState() {
  const el = document.createElement('section');
  el.className = 'container-x py-20 text-center';
  el.innerHTML = `
    <div class="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
         style="background: var(--color-primary-soft); color: var(--color-primary)">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9"  cy="20" r="1.5"/>
        <circle cx="18" cy="20" r="1.5"/>
        <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"/>
      </svg>
    </div>
    <h1 class="mt-5 text-2xl font-bold tracking-tight">Your cart is empty</h1>
    <p class="mt-2 muted">Browse the catalog to add something nice.</p>
    <a href="#/products" class="btn btn-primary mt-6">Browse products</a>
  `;
  return el;
}
