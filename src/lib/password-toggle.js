// Tiny helper to wire a "show / hide password" eye-icon button. Pages
// render the markup inline (so the icon paints with the rest of the form),
// and call wirePasswordToggle(root) once to bind the click handlers.

export function eyeIcon() {
  return `<svg data-pw-icon-show width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;
}

function eyeOffIcon() {
  return `<svg data-pw-icon-hide width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.7 19.7 0 0 1 4.22-5.06"/>
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.5 19.5 0 0 1-3.16 4.19"/>
    <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;
}

export function wirePasswordToggle(root) {
  root.querySelectorAll('[data-pw-toggle]').forEach((btn) => {
    const wrapper = btn.parentElement;
    const input = wrapper && wrapper.querySelector('input[type="password"], input[data-pw]');
    if (!input) return;
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      btn.innerHTML = showing ? eyeIcon() : eyeOffIcon();
    });
  });
}
