import { registerCustomer, isCustomerLoggedIn } from '../services/customer-auth.js';
import { supabase } from '../services/supabase.js';
import { showToast } from '../components/toast.js';
import { wirePasswordToggle, eyeIcon } from '../lib/password-toggle.js';

export async function RegisterPage() {
  const root = document.createElement('section');
  root.className = 'container-x py-10 max-w-md';

  if (isCustomerLoggedIn()) {
    root.innerHTML = `
      <div class="card p-6 text-center">
        <p class="font-medium">You're already signed in.</p>
        <a href="#/account" class="btn btn-primary mt-4">Go to my account</a>
      </div>`;
    return root;
  }

  root.innerHTML = `
    <header class="mb-5">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Create account</h1>
      <p class="muted text-sm mt-1">Use your phone number or email and a password.</p>
    </header>

    <form data-form class="card p-5 sm:p-6 space-y-4" novalidate>
      <div>
        <label class="label" for="r-name">Full name (optional)</label>
        <input id="r-name" data-name class="input" maxlength="80" placeholder="Your name" />
      </div>
      <div>
        <label class="label" for="r-id">Phone or email</label>
        <input id="r-id" data-identifier class="input" required autocomplete="username"
               placeholder="01XXXXXXXXX or you@example.com" />
        <p class="text-xs muted mt-1">Bangladeshi phone numbers are accepted (digits only).</p>
      </div>
      <div>
        <label class="label" for="r-pw">Password</label>
        <div class="relative">
          <input id="r-pw" data-pw type="password" class="input pr-10" required minlength="6"
                 autocomplete="new-password" placeholder="At least 6 characters" />
          <button type="button" data-pw-toggle aria-label="Show password"
                  class="absolute inset-y-0 right-2 flex items-center muted hover:opacity-70">
            ${eyeIcon()}
          </button>
        </div>
      </div>
      <p data-error class="text-sm hidden" style="color:#b91c1c"></p>
      <button type="submit" class="btn btn-primary w-full">Create account</button>
      <p class="text-xs muted text-center">
        Already have an account? <a href="#/login" class="underline">Sign in</a>
      </p>
    </form>

    <div data-success class="hidden card p-6 mt-4 text-center"
         style="border-color:#bbf7d0;background:#f0fdf4">
      <p class="font-medium" style="color:#166534">Account created!</p>
      <p class="text-sm mt-1" style="color:#166534">Redirecting to sign in…</p>
    </div>
  `;

  const form = root.querySelector('[data-form]');
  const errEl = form.querySelector('[data-error]');
  const ok = root.querySelector('[data-success]');
  const submit = form.querySelector('button[type="submit"]');
  wirePasswordToggle(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.classList.add('hidden');
    submit.disabled = true; submit.textContent = 'Creating…';
    try {
      const result = await registerCustomer({
        identifier: form.querySelector('[data-identifier]').value,
        password:   form.querySelector('[data-pw]').value,
        fullName:   form.querySelector('[data-name]').value,
      });
      // Honour the requested UX: show success, then send the user through
      // the login form rather than auto-signing in. The server-side
      // session token from registration is invalidated so the user has to
      // sign in fresh.
      try { await supabase.rpc('logout_customer', { p_token: result.token }); } catch {}
      form.classList.add('hidden');
      ok.classList.remove('hidden');
      showToast('Account created — please sign in', { variant: 'success' });
      setTimeout(() => { location.hash = '#/login'; }, 1600);
    } catch (err) {
      errEl.textContent = err.message || 'Sign-up failed.';
      errEl.classList.remove('hidden');
      submit.disabled = false; submit.textContent = 'Create account';
    }
  });

  return root;
}
