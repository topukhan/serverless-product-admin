import { cartCount, onCartChange } from '../services/cart.js';

// Cart icon for the header. Shows a count badge that updates live as items
// are added/removed anywhere in the app.
export function CartIcon() {
  const a = document.createElement('a');
  a.href = '#/cart';
  a.className = 'btn-icon relative';
  a.setAttribute('aria-label', 'Open cart');
  a.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="9"  cy="20" r="1.5"/>
      <circle cx="18" cy="20" r="1.5"/>
      <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"/>
    </svg>
    <span data-badge
          class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1
                 rounded-full text-[10px] font-semibold text-white
                 inline-flex items-center justify-center hidden"
          style="background: var(--color-primary)">0</span>
  `;
  const badge = a.querySelector('[data-badge]');

  const update = () => {
    const n = cartCount();
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n === 0);
  };
  update();
  onCartChange(update);
  return a;
}
