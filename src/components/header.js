import {
  getBranding,
  hasDarkTheme,
  getResolvedColorScheme,
  setColorScheme,
  onColorSchemeChange,
} from '../services/branding.js';
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
        ${hasDarkTheme() ? `<button data-theme-toggle class="btn-icon" aria-label="Toggle theme"></button>` : ''}
        <span data-cart-slot></span>
      </div>
    </div>
  `;

  el.querySelector('[data-cart-slot]').replaceWith(CartIcon());

  // Theme toggle (only rendered when a dark theme is configured).
  const themeBtn = el.querySelector('[data-theme-toggle]');
  if (themeBtn) {
    function paintTheme() {
      const scheme = getResolvedColorScheme();
      themeBtn.innerHTML = scheme === 'dark' ? sunIcon() : moonIcon();
      themeBtn.title = scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
    paintTheme();
    themeBtn.addEventListener('click', () => {
      const next = getResolvedColorScheme() === 'dark' ? 'light' : 'dark';
      setColorScheme(next);
    });
    onColorSchemeChange(paintTheme);
  }

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

function sunIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>`;
}

function moonIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}
