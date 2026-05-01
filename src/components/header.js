import {
  getBranding,
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
    <div class="container-x h-14 flex items-center gap-2">
      <!-- Logo + brand name -->
      <a href="#/" class="flex items-center gap-2 group min-w-0 flex-1">
        ${b.logo_url
          ? `<img src="${b.logo_url}" alt="${escapeHtml(b.site_name)}" class="h-7 w-auto shrink-0" />`
          : `<span class="inline-block w-7 h-7 rounded-md shrink-0 transition group-hover:scale-105"
                   style="background: var(--color-primary)"></span>`
        }
        <span class="font-semibold text-[15px] tracking-tight truncate">${escapeHtml(b.site_name)}</span>
      </a>

      <!-- Desktop nav (hidden on mobile) -->
      <nav class="hidden sm:flex items-center gap-1 text-sm" aria-label="Main navigation">
        ${navLink('#/',            'Home')}
        ${navLink('#/products',    'Products')}
        ${navLink('#/track-order', 'Track')}
      </nav>

      <!-- Right side: theme toggle + cart + mobile hamburger -->
      <div class="flex items-center gap-1 shrink-0">
        <button data-theme-toggle class="btn-icon" aria-label="Toggle theme"></button>
        <span data-cart-slot></span>
        <button data-mobile-toggle class="btn-icon sm:hidden" aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18M3 12h18M3 18h18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile dropdown nav (sm:hidden so it only shows on mobile) -->
    <div data-mobile-nav class="hidden sm:!hidden border-t"
         style="border-color: var(--color-border); background: var(--color-surface)">
      <nav class="container-x py-2 flex flex-col" aria-label="Mobile navigation">
        ${mobileNavLink('#/',            'Home')}
        ${mobileNavLink('#/products',    'Products')}
        ${mobileNavLink('#/track-order', 'Track')}
      </nav>
    </div>
  `;

  el.querySelector('[data-cart-slot]').replaceWith(CartIcon());

  // Theme toggle
  const themeBtn = el.querySelector('[data-theme-toggle]');
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

  // Mobile menu toggle
  const mobileNav = el.querySelector('[data-mobile-nav]');
  const mobileToggle = el.querySelector('[data-mobile-toggle]');

  mobileToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    mobileNav.classList.toggle('hidden');
  });

  // Close when clicking outside the header
  const closeOnOutside = (e) => {
    if (!el.isConnected) { document.removeEventListener('click', closeOnOutside); return; }
    if (!el.contains(e.target)) mobileNav.classList.add('hidden');
  };
  document.addEventListener('click', closeOnOutside);

  // Close when a mobile nav link is clicked
  mobileNav.querySelectorAll('a[data-link]').forEach((a) =>
    a.addEventListener('click', () => mobileNav.classList.add('hidden'))
  );

  // Active route highlight (both desktop and mobile links share [data-link])
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

function mobileNavLink(href, label) {
  return `<a data-link href="${href}"
            class="px-3 py-2.5 rounded-md text-sm transition hover:text-[color:var(--color-text)]">
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
