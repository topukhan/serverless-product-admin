import { loginCustomer, isCustomerLoggedIn } from '../services/customer-auth.js';
import { showToast } from '../components/toast.js';
import { wirePasswordToggle, eyeIcon } from '../lib/password-toggle.js';

export async function LoginPage() {
  const root = document.createElement('section');
  root.className = 'container-x py-10 max-w-md';

  if (isCustomerLoggedIn()) {
    location.hash = '#/account';
    return root;
  }

  root.innerHTML = `
    <header class="mb-5">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Sign in</h1>
      <p class="muted text-sm mt-1">Welcome back — sign in with your phone or email.</p>
    </header>

    <form data-form class="card p-5 sm:p-6 space-y-4" novalidate>
      <div>
        <label class="label" for="l-id">Phone or email</label>
        <input id="l-id" data-identifier class="input" required autocomplete="username"
               placeholder="01XXXXXXXXX or you@example.com" />
      </div>
      <div>
        <label class="label" for="l-pw">Password</label>
        <div class="relative">
          <input id="l-pw" data-pw type="password" class="input pr-10" required
                 autocomplete="current-password" placeholder="••••••••" />
          <button type="button" data-pw-toggle aria-label="Show password"
                  class="absolute inset-y-0 right-2 flex items-center muted hover:opacity-70">
            ${eyeIcon()}
          </button>
        </div>
      </div>
      <p data-error class="text-sm hidden" style="color:#b91c1c"></p>
      <button type="submit" class="btn btn-primary w-full">Sign in</button>
      <div class="flex items-center justify-between text-xs muted">
        <a href="#/forgot-password" class="underline">Forgot password?</a>
        <span>New here? <a href="#/register" class="underline">Create an account</a></span>
      </div>
    </form>
  `;

  const form = root.querySelector('[data-form]');
  const errEl = form.querySelector('[data-error]');
  const submit = form.querySelector('button[type="submit"]');
  wirePasswordToggle(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    submit.disabled = true; submit.textContent = 'Signing in…';
    try {
      await loginCustomer({
        identifier: form.querySelector('[data-identifier]').value,
        password:   form.querySelector('[data-pw]').value,
      });
      showToast('Welcome back', { variant: 'success' });
      location.hash = '#/account';
    } catch (err) {
      errEl.textContent = err.message || 'Sign-in failed.';
      errEl.classList.remove('hidden');
      submit.disabled = false; submit.textContent = 'Sign in';
    }
  });

  return root;
}
