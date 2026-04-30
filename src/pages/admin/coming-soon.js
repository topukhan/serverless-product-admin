// Placeholder for admin pages that haven't been built yet (Phases 3b–3e).
export function AdminComingSoon(title, phase) {
  const el = document.createElement('section');
  el.className = 'p-6 sm:p-10';
  el.innerHTML = `
    <h1 class="text-2xl font-bold tracking-tight">${title}</h1>
    <div class="mt-6 card p-8 text-center">
      <div class="mx-auto w-12 h-12 rounded-full inline-flex items-center justify-center"
           style="background: var(--color-primary-soft); color: var(--color-primary)">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <p class="mt-4 font-medium">Coming in ${phase}</p>
      <p class="text-sm muted mt-1">
        This admin page is on the roadmap. The shell, auth and dashboard are wired up
        — feature pages roll out one at a time so each is verifiable.
      </p>
      <a href="#/admin" class="btn btn-ghost mt-5">Back to dashboard</a>
    </div>
  `;
  return el;
}
