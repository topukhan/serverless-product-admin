import { escapeHtml } from '../lib/dom.js';

export function NotFoundPage(path) {
  const el = document.createElement('section');
  el.className = 'container-x py-20 sm:py-28 text-center';
  el.innerHTML = `
    <div class="mx-auto w-20 h-20 rounded-full inline-flex items-center justify-center"
         style="background: var(--color-primary-soft); color: var(--color-primary)">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8"  y1="11" x2="14" y2="11"/>
      </svg>
    </div>
    <h1 class="mt-6 text-5xl sm:text-6xl font-bold tracking-tight">404</h1>
    <p class="mt-3 text-lg muted max-w-md mx-auto leading-relaxed">
      We couldn't find that page. It may have been moved, removed, or never existed.
    </p>
    ${path && path !== '/' ? `
      <p class="mt-2 text-xs muted">
        No route matched <code class="px-1 py-0.5 rounded"
          style="background: var(--color-bg)">${escapeHtml(path)}</code>
      </p>` : ''}
    <div class="mt-8 flex flex-wrap gap-3 justify-center">
      <a href="#/products" class="btn btn-primary">Browse products →</a>
      <a href="#/" class="btn btn-ghost">Go home</a>
    </div>
  `;
  return el;
}
