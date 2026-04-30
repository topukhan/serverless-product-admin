import { escapeHtml } from '../lib/dom.js';

// Promise-based confirm dialog. Replaces native window.confirm().
// Resolves true if confirmed, false on cancel / ESC / backdrop click.
//
//   const ok = await confirmDialog({
//     title: 'Clear cart?',
//     message: 'This will remove all items.',
//     confirmText: 'Clear',
//     variant: 'danger',
//   });
export function confirmDialog({
  title,
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',         // 'default' | 'danger'
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4';
    backdrop.style.background = 'rgb(15 17 13 / 0.45)';
    backdrop.style.backdropFilter = 'blur(4px)';
    backdrop.style.opacity = '0';
    backdrop.style.transition = 'opacity 160ms ease-out';

    const modal = document.createElement('div');
    modal.className = 'card w-full max-w-sm p-6 sm:p-7 shadow-lg';
    modal.style.transform = 'scale(0.96) translateY(6px)';
    modal.style.transition = 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2)';

    const isDanger = variant === 'danger';
    const confirmStyle = isDanger
      ? 'background: #b91c1c; color: #fff;'
      : '';
    const confirmClass = isDanger ? 'btn' : 'btn btn-primary';

    modal.innerHTML = `
      <div class="flex items-start gap-3.5">
        <div class="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center"
             style="${isDanger
               ? 'background:#fee2e2;color:#b91c1c'
               : 'background:var(--color-primary-soft);color:var(--color-primary)'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${isDanger
              ? '<path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>'
              : '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'}
          </svg>
        </div>
        <div class="flex-1">
          <h2 class="text-base font-semibold">${escapeHtml(title)}</h2>
          ${message
            ? `<p class="mt-1 text-sm muted leading-relaxed">${escapeHtml(message)}</p>`
            : ''}
        </div>
      </div>
      <div class="mt-6 flex justify-end gap-2.5">
        <button data-cancel class="btn btn-ghost">${escapeHtml(cancelText)}</button>
        <button data-confirm class="${confirmClass}" style="${confirmStyle}">
          ${escapeHtml(confirmText)}
        </button>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Lock scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Animate in.
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
    });

    function close(result) {
      backdrop.style.opacity = '0';
      modal.style.transform = 'scale(0.96) translateY(6px)';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        backdrop.remove();
        document.body.style.overflow = prevOverflow;
        resolve(result);
      }, 180);
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    }
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    modal.querySelector('[data-cancel]').addEventListener('click', () => close(false));
    modal.querySelector('[data-confirm]').addEventListener('click', () => close(true));

    setTimeout(() => modal.querySelector('[data-confirm]').focus(), 60);
  });
}
