import { getBranding } from '../services/branding.js';
import { escapeHtml } from '../lib/dom.js';

export function Footer() {
  const b = getBranding();
  const el = document.createElement('footer');
  el.className = 'mt-24';
  el.style.borderTop = '1px solid var(--color-border)';
  el.style.background = 'var(--color-surface)';

  el.innerHTML = `
    <div class="container-x py-12 grid gap-10 sm:grid-cols-3 text-sm">
      <div>
        <div class="flex items-center gap-2.5">
          ${b.logo_url
            ? `<img src="${b.logo_url}" alt="" class="h-7 w-auto" />`
            : `<span class="inline-block w-7 h-7 rounded-md" style="background: var(--color-primary)"></span>`
          }
          <span class="font-semibold tracking-tight">${escapeHtml(b.site_name)}</span>
        </div>
        <p class="mt-3 max-w-xs muted leading-relaxed">
          A calm, dynamic product showcase. Catalog, brand, and theme — all
          managed live.
        </p>
      </div>
      <div>
        <div class="text-xs font-semibold uppercase tracking-wider muted">Shop</div>
        <ul class="mt-3 space-y-2">
          ${footerLink('#/products', 'All products')}
          ${footerLink('#/cart',     'Cart')}
          ${footerLink('#/',         'Home')}
        </ul>
      </div>
      <div>
        <div class="text-xs font-semibold uppercase tracking-wider muted">About</div>
        <ul class="mt-3 space-y-2 muted">
          <li>Built with Supabase + Vite</li>
          <li>© ${new Date().getFullYear()} ${escapeHtml(b.site_name)}</li>
          <li><a href="#/admin" class="muted hover:text-[color:var(--color-text)] underline-offset-2 hover:underline">Admin</a></li>
        </ul>
      </div>
    </div>
  `;
  return el;
}

function footerLink(href, label) {
  return `<li><a href="${href}" class="muted hover:text-[color:var(--color-text)] transition">${label}</a></li>`;
}
