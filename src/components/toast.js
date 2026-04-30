import { escapeHtml } from '../lib/dom.js';

// Lightweight toast notifications. Stack at the bottom-right.
//   showToast('Cart cleared');
//   showToast('Saved', { variant: 'success' });
//   showToast('Failed', { variant: 'error', duration: 4000 });
export function showToast(message, { variant = 'default', duration = 2400 } = {}) {
  const host = ensureHost();
  const t = document.createElement('div');
  t.className = 'card px-4 py-3 text-sm pointer-events-auto shadow-md flex items-center gap-2.5';
  t.style.transform = 'translateY(8px)';
  t.style.opacity = '0';
  t.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
  t.style.minWidth = '220px';

  const dotColor = {
    default: 'var(--color-primary)',
    success: '#16a34a',
    error:   '#b91c1c',
  }[variant] || 'var(--color-primary)';

  t.innerHTML = `
    <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${dotColor}"></span>
    <span class="flex-1">${escapeHtml(message)}</span>
  `;

  host.appendChild(t);
  requestAnimationFrame(() => {
    t.style.transform = 'translateY(0)';
    t.style.opacity = '1';
  });

  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    setTimeout(() => t.remove(), 200);
  }, duration);
}

function ensureHost() {
  let host = document.getElementById('toast-host');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'toast-host';
  host.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none';
  document.body.appendChild(host);
  return host;
}
