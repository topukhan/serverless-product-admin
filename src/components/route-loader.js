// Thin top-of-page progress bar shown during route transitions. Toggled by
// the router via `route:start` / `route:end` events. Visibility is gated by
// the `show_route_loader` site flag — admins can disable it from settings.
import { getFlag } from '../services/branding.js';

let bar = null;
let depth = 0;
let hideTimer = null;

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.id = 'route-loader';
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; height: 2px; width: 0%;
    z-index: 60;
    background: var(--color-primary);
    box-shadow: 0 0 6px var(--color-primary);
    transition: width .25s ease, opacity .25s ease;
    opacity: 0; pointer-events: none;
  `;
  document.body.appendChild(bar);
  return bar;
}

export function installRouteLoader() {
  ensureBar();
  window.addEventListener('route:start', start);
  window.addEventListener('route:end',   end);
}

function start() {
  if (!getFlag('show_route_loader')) return;
  ensureBar();
  depth++;
  clearTimeout(hideTimer);
  bar.style.opacity = '1';
  // Bump the bar forward in chunks. We never reach 100% on start; the end
  // handler completes the animation. This mimics the YouTube-style loader.
  const cur = parseFloat(bar.style.width) || 0;
  const next = Math.min(cur + 30 + Math.random() * 30, 85);
  requestAnimationFrame(() => { bar.style.width = next + '%'; });
}

function end() {
  if (!bar) return;
  depth = Math.max(0, depth - 1);
  if (depth > 0) return;
  bar.style.width = '100%';
  hideTimer = setTimeout(() => {
    bar.style.opacity = '0';
    bar.style.width = '0%';
  }, 220);
}
