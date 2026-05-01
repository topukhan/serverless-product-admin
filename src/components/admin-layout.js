import { signOut, getUser } from '../services/auth.js';
import { getPendingOrderCount } from '../services/admin-orders.js';
import { getAdminUnreadMessageCount } from '../services/order-messages.js';
import {
  getResolvedColorScheme,
  setColorScheme,
  onColorSchemeChange,
} from '../services/branding.js';
import { showToast } from './toast.js';
import { confirmDialog } from './dialog.js';
import { escapeHtml } from '../lib/dom.js';

const NAV = [
  { key: 'dashboard',     href: '#/admin',               label: 'Dashboard',      icon: iconDashboard },
  { key: 'orders',        href: '#/admin/orders',        label: 'Orders',         icon: iconCart, badge: 'pending' },
  { key: 'customers',     href: '#/admin/customers',     label: 'Customers',      icon: iconUsers },
  { key: 'products',      href: '#/admin/products',      label: 'Products',       icon: iconBox },
  { key: 'categories',    href: '#/admin/categories',    label: 'Categories',     icon: iconTag },
  { key: 'reviews',       href: '#/admin/reviews',       label: 'Reviews',        icon: iconStar },
  { key: 'questions',     href: '#/admin/questions',     label: 'Questions',      icon: iconChat },
  { key: 'banners',       href: '#/admin/banners',       label: 'Banners',        icon: iconImage },
  { key: 'branding',      href: '#/admin/branding',      label: 'Theme & Branding', icon: iconPalette },
  { key: 'notifications', href: '#/admin/notifications', label: 'Notifications',  icon: iconBell },
  { key: 'site-settings', href: '#/admin/site-settings', label: 'Site settings',  icon: iconSliders },
];

export async function AdminLayout(content, { active = '' } = {}) {
  const user = await getUser();

  const root = document.createElement('div');
  root.className = 'min-h-screen flex flex-col lg:flex-row';
  root.style.background = 'var(--color-bg)';

  /* ---------- Sidebar ---------- */
  const aside = document.createElement('aside');
  // Sticky on every screen size: full sidebar on lg+, top bar on mobile that
  // stays pinned while the user scrolls.
  aside.className =
    'sticky top-0 z-30 lg:w-60 lg:shrink-0 lg:h-screen lg:flex lg:flex-col ' +
    'border-b lg:border-b-0 lg:border-r';
  aside.style.background = 'var(--color-surface)';
  aside.style.borderColor = 'var(--color-border)';

  aside.innerHTML = `
    <div class="px-4 py-3 flex items-center gap-2 lg:px-5 lg:py-4">
      <a href="#/" class="flex items-center gap-2 flex-1 min-w-0">
        <span class="inline-block w-7 h-7 rounded-md shrink-0" style="background: var(--color-primary)"></span>
        <span class="font-semibold tracking-tight">Admin</span>
      </a>
      <!-- Mobile-only controls -->
      <button data-theme-toggle class="btn-icon lg:hidden" aria-label="Toggle theme"></button>
      <button data-mobile-toggle aria-label="Toggle navigation" class="lg:hidden btn-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18M3 12h18M3 18h18"/>
        </svg>
      </button>
    </div>

    <nav data-nav class="px-2 pb-4 lg:pb-2 lg:flex-1 lg:overflow-y-auto hidden lg:block">
      ${NAV.map((it) => navItem(it, active)).join('')}
    </nav>

    <div class="hidden lg:block px-5 py-4 border-t" style="border-color: var(--color-border)">
      <div class="flex items-center justify-between gap-2">
        <div class="text-xs muted truncate flex-1">${escapeHtml(user?.email || 'Signed in')}</div>
        <button data-theme-toggle class="btn-icon shrink-0" aria-label="Toggle admin theme"></button>
      </div>
      <button data-signout class="btn btn-ghost w-full mt-2 text-sm">Sign out</button>
    </div>
  `;

  // Mobile nav toggle
  const mobileNav = aside.querySelector('[data-nav]');
  aside.querySelector('[data-mobile-toggle]').addEventListener('click', (e) => {
    e.stopPropagation();
    mobileNav.classList.toggle('hidden');
  });

  // Close mobile nav when clicking outside the aside
  const closeOnOutside = (e) => {
    if (!aside.isConnected) { document.removeEventListener('click', closeOnOutside); return; }
    if (!aside.contains(e.target)) mobileNav.classList.add('hidden');
  };
  document.addEventListener('click', closeOnOutside);

  // Close mobile nav when a nav link is clicked
  mobileNav.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => mobileNav.classList.add('hidden'))
  );

  // Admin-side theme toggle — there are two buttons (mobile + desktop).
  const themeBtns = aside.querySelectorAll('[data-theme-toggle]');
  function paintTheme() {
    const scheme = getResolvedColorScheme();
    const title = scheme === 'dark' ? 'Switch admin to light mode' : 'Switch admin to dark mode';
    themeBtns.forEach((btn) => {
      btn.innerHTML = scheme === 'dark' ? sunIcon() : moonIcon();
      btn.title = title;
    });
  }
  paintTheme();
  themeBtns.forEach((btn) => btn.addEventListener('click', () => {
    const next = getResolvedColorScheme() === 'dark' ? 'light' : 'dark';
    setColorScheme(next);
  }));
  onColorSchemeChange(paintTheme);

  // Sign-out (with confirmation)
  aside.querySelector('[data-signout]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Sign out?',
      message: 'You can sign back in at any time.',
      confirmText: 'Sign out',
      cancelText: 'Stay',
    });
    if (!ok) return;
    await signOut();
    showToast('Signed out');
    location.hash = '#/admin/login';
  });

  /* ---------- Main column ---------- */
  const main = document.createElement('main');
  main.className = 'flex-1 min-w-0';
  main.appendChild(content);

  root.append(aside, main);

  // Each AdminLayout render claims "active" status. Pages that mutate orders
  // call notifyPendingChanged() and we re-fetch + repaint the badge live.
  activeAside = aside;
  paintPendingBadge(aside);

  return root;
}

let activeAside = null;

// Public hook: pages call this after they change an order's status so the
// nav badge updates without a navigation away.
export function notifyPendingChanged() {
  if (activeAside && activeAside.isConnected) paintPendingBadge(activeAside);
}

async function paintPendingBadge(aside) {
  let pending = 0;
  let unread  = 0;
  try { pending = await getPendingOrderCount(); } catch { /* non-fatal */ }
  try { unread  = await getAdminUnreadMessageCount(); } catch { /* non-fatal */ }
  if (!aside.isConnected) return;
  const link = aside.querySelector('a[href="#/admin/orders"]');
  if (!link) return;

  setBadge(link, '[data-pending-badge]', 'pendingBadge', pending, '#b91c1c');
  setBadge(link, '[data-msg-badge]',     'msgBadge',     unread,  '#1d4ed8', '💬 ');
}

function setBadge(parent, selector, dataKey, count, bg, prefix = '') {
  let badge = parent.querySelector(selector);
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.dataset[dataKey] = '';
      badge.className = 'ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full';
      badge.style.background = bg;
      badge.style.color = '#fff';
      parent.appendChild(badge);
    }
    badge.textContent = `${prefix}${count}`;
    if (selector === '[data-pending-badge]') badge.classList.add('ml-auto');
  } else if (badge) {
    badge.remove();
  }
}

function navItem({ href, label, icon, key }, active) {
  const isActive = active === key;
  const bg = isActive ? 'background: var(--color-primary-soft);' : '';
  const color = isActive
    ? 'color: var(--color-primary); font-weight: 600;'
    : 'color: var(--color-text);';
  return `
    <a href="${href}"
       class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition mb-0.5
              hover:bg-[color:var(--color-primary-soft)]"
       style="${bg}${color}">
      ${icon()}
      <span>${label}</span>
    </a>
  `;
}

/* ---------- inline icon set ---------- */
const ICON_BASE = `width="18" height="18" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;

function iconDashboard() { return `<svg ${ICON_BASE}>
  <rect x="3"  y="3"  width="7" height="9"/><rect x="14" y="3"  width="7" height="5"/>
  <rect x="14" y="12" width="7" height="9"/><rect x="3"  y="16" width="7" height="5"/>
</svg>`; }
function iconCart() { return `<svg ${ICON_BASE}>
  <circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>
  <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"/>
</svg>`; }
function iconBox() { return `<svg ${ICON_BASE}>
  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
</svg>`; }
function iconTag() { return `<svg ${ICON_BASE}>
  <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
  <line x1="7" y1="7" x2="7.01" y2="7"/>
</svg>`; }
function iconStar() { return `<svg ${ICON_BASE}>
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
</svg>`; }
function iconChat() { return `<svg ${ICON_BASE}>
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
</svg>`; }
function iconPalette() { return `<svg ${ICON_BASE}>
  <circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/>
  <circle cx="8.5"  cy="7.5" r=".5"/><circle cx="6.5"  cy="12.5" r=".5"/>
  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
</svg>`; }
function iconSliders() { return `<svg ${ICON_BASE}>
  <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
  <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8"  x2="12" y2="3"/>
  <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
  <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
  <line x1="17" y1="16" x2="23" y2="16"/>
</svg>`; }
function iconBell() { return `<svg ${ICON_BASE}>
  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
</svg>`; }
function iconImage() { return `<svg ${ICON_BASE}>
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <circle cx="8.5" cy="8.5" r="1.5"/>
  <polyline points="21 15 16 10 5 21"/>
</svg>`; }
function iconUsers() { return `<svg ${ICON_BASE}>
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
  <circle cx="9" cy="7" r="4"/>
  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
</svg>`; }

function sunIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
  </svg>`;
}
function moonIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}
