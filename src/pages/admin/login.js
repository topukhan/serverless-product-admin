import { signIn, signOut, isAdmin, getSession } from '../../services/auth.js';
import { showToast } from '../../components/toast.js';

export async function AdminLoginPage() {
  // If already signed in as admin, bounce to dashboard.
  const session = await getSession();
  if (session && (await isAdmin())) {
    location.hash = '#/admin';
    const wait = document.createElement('div');
    wait.className = 'min-h-screen';
    return wait;
  }

  const root = document.createElement('div');
  root.className = 'min-h-screen flex items-center justify-center p-4';
  root.style.background = 'var(--color-bg)';

  const form = document.createElement('form');
  form.className = 'card w-full max-w-sm p-6 sm:p-8';
  form.innerHTML = `
    <div class="flex items-center gap-2.5 mb-1">
      <span class="inline-block w-7 h-7 rounded-md" style="background: var(--color-primary)"></span>
      <span class="font-semibold tracking-tight">Admin</span>
    </div>
    <h1 class="text-xl font-bold mt-3">Sign in</h1>
    <p class="muted text-sm mt-1">Use the email + password you set up in Supabase.</p>

    <div class="mt-5">
      <label class="label" for="ad-email">Email</label>
      <input id="ad-email" name="email" type="email" autocomplete="email" required
             class="input" placeholder="you@example.com" />
    </div>
    <div class="mt-3">
      <label class="label" for="ad-pw">Password</label>
      <input id="ad-pw" name="password" type="password" autocomplete="current-password" required
             class="input" placeholder="••••••••" />
    </div>

    <p data-error class="mt-3 text-sm hidden" style="color:#b91c1c"></p>

    <button type="submit" class="btn btn-primary w-full mt-5">Sign in</button>

    <p class="mt-4 text-xs muted text-center">
      <a href="#/" class="underline">← Back to public site</a>
    </p>
  `;

  const errEl = form.querySelector('[data-error]');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');

    errEl.classList.add('hidden');
    submit.disabled = true;
    submit.textContent = 'Signing in…';

    try {
      await signIn(email, password);
      const admin = await isAdmin();
      if (!admin) {
        await signOut();
        showError(
          "This account isn't an admin. Add the user's UID to the admins table."
        );
        return;
      }
      showToast('Welcome back', { variant: 'success' });
      location.hash = '#/admin';
    } catch (err) {
      showError(err.message || 'Sign-in failed.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }

  root.appendChild(form);
  return root;
}
