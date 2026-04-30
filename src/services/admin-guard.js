import { getSession, isAdmin } from './auth.js';

// Wrap an admin page render so it only resolves if the current user is an
// admin. Otherwise redirects to the login page (or a not-authorized notice
// for signed-in non-admins).
export async function requireAdmin(renderFn) {
  const session = await getSession();
  if (!session) {
    location.hash = '#/admin/login';
    return blankNode();
  }
  const admin = await isAdmin();
  if (!admin) return notAuthorizedNode();
  return renderFn();
}

function blankNode() {
  const el = document.createElement('div');
  el.className = 'min-h-screen';
  return el;
}

function notAuthorizedNode() {
  const el = document.createElement('section');
  el.className = 'min-h-screen flex items-center justify-center p-6';
  el.style.background = 'var(--color-bg)';
  el.innerHTML = `
    <div class="card max-w-md w-full p-8 text-center">
      <h1 class="text-xl font-bold">Not authorized</h1>
      <p class="muted text-sm mt-2">
        You're signed in, but this account isn't an admin. Ask the project
        owner to add your UID to the <code>admins</code> table in Supabase.
      </p>
      <div class="mt-5 flex gap-2 justify-center">
        <a href="#/" class="btn btn-ghost">Public site</a>
        <a href="#/admin/login" class="btn btn-primary">Switch account</a>
      </div>
    </div>
  `;
  return el;
}
