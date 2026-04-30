import { getBranding } from '../services/branding.js';
import { escapeHtml } from '../lib/dom.js';
import { CartIcon } from './cart-icon.js';

export function Header() {
  const b = getBranding();
  const el = document.createElement('header');
  el.className = 'sticky top-0 z-30 backdrop-blur-md';
  el.style.background = 'color-mix(in srgb, var(--color-surface) 80%, transparent)';
  el.style.borderBottom = '1px solid var(--color-border)';

  el.innerHTML = `
    <div class="container-x h-16 flex items-center justify-between gap-4">
      <a href="#/" class="flex items-center gap-2.5 group">
        ${b.logo_url
          ? `<img src="${b.logo_url}" alt="${escapeHtml(b.site_name)}" class="h-8 w-auto" />`
          : `<span class="inline-block w-8 h-8 rounded-md transition group-hover:scale-105"
                   style="background: var(--color-primary)"></span>`
        }
        <span class="font-semibold text-[15px] tracking-tight">${escapeHtml(b.site_name)}</span>
      </a>
      <div class="flex items-center gap-1">
        <nav class="flex items-center gap-1 text-sm mr-1">
          ${navLink('#/',             'Home')}
          ${navLink('#/products',     'Products')}
          ${navLink('#/track-order',  'Track')}
        </nav>
        <span data-cart-slot></span>
      </div>
    </div>
  `;

  el.querySelector('[data-cart-slot]').replaceWith(CartIcon());

  // Active route highlight
  const updateActive = () => {
    const hash = location.hash || '#/';
    el.querySelectorAll('[data-link]').forEach((a) => {
      const isActive = a.getAttribute('href') === hash;
      a.classList.toggle('is-active', isActive);
      a.style.color = isActive ? 'var(--color-text)' : 'var(--color-muted)';
      a.style.background = isActive ? 'var(--color-primary-soft)' : 'transparent';
    });
  };
  updateActive();
  window.addEventListener('hashchange', updateActive);

  return el;
}

function navLink(href, label) {
  return `<a data-link href="${href}"
            class="px-3 py-1.5 rounded-md transition hover:text-[color:var(--color-text)]">
            ${label}
          </a>`;
}
