import {
  getBranding,
  getResolvedColorScheme,
  setColorScheme,
  onColorSchemeChange,
} from '../services/branding.js';
import {
  isCustomerLoggedIn, onCustomerAuthChange, getCachedCustomerProfile,
} from '../services/customer-auth.js';
import { getMyUnreadMessageCount } from '../services/customer-orders.js';
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

      <!-- Right side: account + theme + cart + mobile hamburger.
           The account slot is always visible (no mobile collapse) so the
           sign-in CTA / account icon is one tap away on every screen. -->
      <div class="flex items-center gap-1.5 shrink-0">
        <span data-account-slot></span>
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

  // Account / sign-in slot reflects auth state. Logged out -> primary
  // "Sign in" pill; logged in -> circular avatar icon with unread dot.
  const accountSlot = el.querySelector('[data-account-slot]');

  async function paintAccount() {
    if (!isCustomerLoggedIn()) {
      accountSlot.innerHTML = `
        <a href="#/login"
           class="btn btn-primary text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2"
           style="border-radius:999px">
          Sign in
        </a>`;
    } else {
      let unread = 0;
      try { unread = await getMyUnreadMessageCount(); } catch {}
      const initials = initialsFromProfile(getCachedCustomerProfile());
      const dot = unread > 0
        ? `<span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] inline-flex items-center justify-center
                       rounded-full text-[10px] font-semibold px-1"
                 style="background:#1d4ed8;color:#fff;border:2px solid var(--color-surface)">${unread}</span>`
        : '';
      accountSlot.innerHTML = `
        <a href="#/account" aria-label="My account"
           class="relative inline-flex items-center justify-center w-9 h-9 rounded-full
                  text-sm font-semibold transition hover:opacity-90"
           style="background:var(--color-primary);color:#fff">
          ${initials || personIcon()}
          ${dot}
        </a>`;
    }
    updateActive();
  }
  paintAccount();
  onCustomerAuthChange(() => paintAccount());
  window.addEventListener('hashchange', paintAccount);
  window.addEventListener('unread-messages:changed', paintAccount);

  return el;
}

function initialsFromProfile(p) {
  if (!p) return '';
  const name = (p.full_name || '').trim();
  if (!name) return '';
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase().slice(0, 2);
}

function personIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
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
