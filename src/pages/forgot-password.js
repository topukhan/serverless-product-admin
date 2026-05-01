import { getBranding } from '../services/branding.js';
import { escapeHtml } from '../lib/dom.js';

export function ForgotPasswordPage() {
  const root = document.createElement('section');
  root.className = 'container-x py-10 max-w-md';

  const url = (getBranding().password_reset_url || '').trim();
  const hasUrl = !!url;

  root.innerHTML = `
    <header class="mb-5">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Forgot password?</h1>
      <p class="muted text-sm mt-1">Here's how a password reset works on our store.</p>
    </header>

    <div class="card p-5 sm:p-6 space-y-4">
      <ol class="text-sm space-y-3 list-decimal pl-5">
        <li>Click the <strong>Send message</strong> button below — it opens our support channel with a pre-filled request.</li>
        <li>Tell us the phone or email you registered with so we can find your account.</li>
        <li>We'll set a temporary password and send it back to you on the same channel.</li>
        <li>Sign in with that temporary password, then change it from <em>My account → Change password</em>.</li>
      </ol>

      <p class="text-xs muted">
        For your security, all existing sign-ins are revoked when an admin resets your password.
      </p>

      ${hasUrl ? '' : `
        <div class="rounded-md p-3 text-xs"
             style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">
          The site admin hasn't configured a password-reset contact link yet.
          Please use the contact info on the home page to reach us.
        </div>
      `}

      <div class="flex flex-col sm:flex-row-reverse gap-2 pt-2">
        ${hasUrl
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"
                class="btn btn-primary w-full sm:w-auto">Send message</a>`
          : `<button class="btn btn-primary w-full sm:w-auto" disabled>Send message</button>`}
        <a href="#/login" class="btn btn-ghost w-full sm:w-auto">Cancel</a>
      </div>
    </div>
  `;

  return root;
}
