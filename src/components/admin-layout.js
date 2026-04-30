import { signOut, getUser } from '../services/auth.js';
import { getPendingOrderCount } from '../services/admin-orders.js';
import { showToast } from './toast.js';
import { confirmDialog } from './dialog.js';
import { escapeHtml } from '../lib/dom.js';

const NAV = [
  { key: 'dashboard',     href: '#/admin',               label: 'Dashboard',      icon: iconDashboard },
  { key: 'orders',        href: '#/admin/orders',        label: 'Orders',         icon: iconCart, badge: 'pending' },
  { key: 'products',      href: '#/admin/products',      label: 'Products',       icon: iconBox },
  { key: 'categories',    href: '#/admin/categories',    label: 'Categories',     icon: iconTag },
  { key: 'reviews',       href: '#/admin/reviews',       label: 'Reviews',        icon: iconStar },
  { key: 'questions',     href: '#/admin/questions',     label: 'Questions',      icon: iconChat },
  { key: 'branding',      href: '#/admin/branding',      label: 'Branding',       icon: iconPalette },
  { key: 'site-settings', href: '#/admin/site-settings', label: 'Site settings',  icon: iconSliders },
];

export async function AdminLayout(content, { active = '' } = {}) {
  const user = await getUser();

  const root = document.createElement('div');
  root.className = 'min-h-screen flex flex-col lg:flex-row';
  root.style.background = 'var(--color-bg)';

  /* ---------- Sidebar ---------- */
  const aside = document.createElement('aside');
  aside.className =
    'lg:w-60 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 lg:flex lg:flex-col ' +
    'border-b lg:border-b-0 lg:border-r';
  aside.style.background = 'var(--color-surface)';
  aside.style.borderColor = 'var(--color-border)';

  aside.innerHTML = `
    <div class="px-5 py-4 flex items-center justify-between lg:justify-start gap-3">
      <a href="#/" class="flex items-center gap-2.5">
        <span class="inline-block w-7 h-7 rounded-md" style="background: var(--color-primary)"></span>
        <span class="font-semibold tracking-tight">Admin</span>
      </a>
      <button data-mobile-toggle aria-label="Toggle navigation"
              class="lg:hidden btn-icon">
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
      <div class="text-xs muted truncate">${escapeHtml(user?.email || 'Signed in')}</div>
      <button data-signout class="btn btn-ghost w-full mt-2 text-sm">Sign out</button>
    </div>
  `;

  // Mobile nav toggle
  aside.querySelector('[data-mobile-toggle]').addEventListener('click', () => {
    const nav = aside.querySelector('[data-nav]');
    nav.classList.toggle('hidden');
  });

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

  // Fetch pending count and paint the Orders badge. Non-blocking.
  getPendingOrderCount()
    .then((count) => {
      if (!count) return;
      const link = aside.querySelector('a[href="#/admin/orders"]');
      if (!link) return;
      const span = document.createElement('span');
      span.className = 'ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full';
      span.style.background = '#b91c1c';
      span.style.color = '#fff';
      span.textContent = String(count);
      link.appendChild(span);
    })
    .catch(() => {}); // non-fatal

  return root;
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
