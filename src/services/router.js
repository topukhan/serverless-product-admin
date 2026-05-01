// Minimal hash-based router. URLs look like #/, #/products, #/product/:id.
// Hash routing avoids needing server-side rewrites — works on any static host.

const routes = [];
let outlet = null;
let notFoundHandler = (path) => defaultNotFound(path);

export function defineRoute(pattern, render) {
  // pattern e.g. "/", "/products", "/product/:id"
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ regex, keys, render });
}

// Inject a custom not-found renderer (e.g. wrapping the friendly 404 page in
// the public Layout). Called once from main.js after defineRoute calls.
export function setNotFoundHandler(fn) {
  notFoundHandler = fn;
}

export function startRouter(mountEl) {
  outlet = mountEl;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}

export function navigate(path) {
  location.hash = '#' + path;
}

async function renderCurrent() {
  const raw = location.hash.replace(/^#/, '') || '/';
  // Split off any querystring (e.g. /admin/orders?status=approved).
  const qIdx = raw.indexOf('?');
  const path = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const queryString = qIdx === -1 ? '' : raw.slice(qIdx + 1);
  const query = Object.fromEntries(new URLSearchParams(queryString));

  window.dispatchEvent(new CustomEvent('route:start', { detail: { path } }));
  try {
    for (const route of routes) {
      const m = route.regex.exec(path);
      if (m) {
        const params = Object.fromEntries(
          route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])
        );
        params.query = query;
        const node = await route.render(params);
        outlet.replaceChildren(node);
        window.scrollTo(0, 0);
        return;
      }
    }
    const node = await notFoundHandler(path);
    outlet.replaceChildren(node);
    window.scrollTo(0, 0);
  } finally {
    window.dispatchEvent(new CustomEvent('route:end', { detail: { path } }));
  }
}

function defaultNotFound(path) {
  const el = document.createElement('div');
  el.className = 'p-8 text-center';
  el.innerHTML = `<h1 class="text-2xl font-semibold">404</h1>
    <p class="muted mt-2">No route matched <code>${path}</code>.</p>
    <a href="#/" class="underline mt-4 inline-block" style="color: var(--color-primary)">Go home</a>`;
  return el;
}
