import { getMyUnreadMessageCount } from '../services/customer-orders.js';

// Shared subnav for the customer account section.
// Links: Profile, Orders. Highlights the active tab and shows an unread
// chat-message badge on "My orders" that auto-refreshes when chat is read.
export function AccountSubnav(active = 'profile') {
  const wrap = document.createElement('nav');
  wrap.className = 'flex gap-2 text-sm border-b';
  wrap.style.borderColor = 'var(--color-border)';

  const tabs = [
    { key: 'profile', href: '#/account',        label: 'Profile', badge: false },
    { key: 'orders',  href: '#/account/orders', label: 'My orders', badge: true },
  ];

  wrap.innerHTML = tabs.map((t) => {
    const isActive = t.key === active;
    return `
      <a data-tab="${t.key}" href="${t.href}"
         class="inline-flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 transition"
         style="border-color: ${isActive ? 'var(--color-primary)' : 'transparent'};
                color: ${isActive ? 'var(--color-text)' : 'var(--color-muted)'};
                font-weight: ${isActive ? '600' : '400'}">
        <span>${t.label}</span>
        ${t.badge ? `<span data-orders-badge class="hidden text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style="background:#1d4ed8;color:#fff"></span>` : ''}
      </a>`;
  }).join('');

  const badge = wrap.querySelector('[data-orders-badge]');
  async function paintBadge() {
    if (!badge) return;
    let n = 0;
    try { n = await getMyUnreadMessageCount(); } catch {}
    if (n > 0) {
      badge.textContent = String(n);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  paintBadge();
  const onChanged = () => paintBadge();
  window.addEventListener('unread-messages:changed', onChanged);
  // Clean up the listener when the subnav leaves the DOM (the next route
  // render replaces #app, detaching this node).
  const observer = new MutationObserver(() => {
    if (!wrap.isConnected) {
      window.removeEventListener('unread-messages:changed', onChanged);
      observer.disconnect();
    }
  });
  // Observe the eventual parent once mounted.
  setTimeout(() => {
    if (wrap.parentNode) observer.observe(wrap.parentNode, { childList: true, subtree: true });
  }, 0);

  return wrap;
}
