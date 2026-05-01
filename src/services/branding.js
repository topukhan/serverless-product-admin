import { supabase } from './supabase.js';

const FALLBACK_BRAND = {
  site_name: 'My Store',
  logo_url: null,
  favicon_url: null,
  font_family: 'ui-sans-serif, system-ui, sans-serif',
  // Order settings — overridden by DB row when settings load.
  order_rate_limit_count: 5,
  order_rate_limit_minutes: 15,
  delivery_charge_inside_dhaka: 60,
  delivery_charge_outside_dhaka: 130,
  delivery_label_inside_dhaka:  'Inside Dhaka',
  delivery_label_outside_dhaka: 'Outside Dhaka',
  order_message_limit:          10,
  password_reset_url:           '',
};

// Defaults for site-level feature flags. Add a key here AND in the schema
// migration if you introduce a new flag.
export const DEFAULT_FLAGS = {
  show_stock:        true,
  show_sold:         true,
  show_route_loader: true,
};

// Default light + dark palettes used when nothing is loaded yet.
const FALLBACK_LIGHT = {
  bg: '#f7f3ed', surface: '#ffffff', border: '#e8e1d4',
  text: '#1f1c18', muted: '#6b6358',
  primary: '#5a6b4a', primary_hover: '#4a5a3c',
  secondary: '#a89580', accent: '#c8956d',
};
const FALLBACK_DARK = {
  bg: '#0f1115', surface: '#1a1d23', border: '#2a2e36',
  text: '#e8e6e1', muted: '#9aa0a8',
  primary: '#9bb886', primary_hover: '#a8c690',
  secondary: '#7a8a6e', accent: '#d4a373',
};
// Field name -> CSS variable. The 9 logical slots a palette holds.
const PALETTE_KEYS = [
  ['bg',            '--color-bg'],
  ['surface',       '--color-surface'],
  ['border',        '--color-border'],
  ['text',          '--color-text'],
  ['muted',         '--color-muted'],
  ['primary',       '--color-primary'],
  ['primary_hover', '--color-primary-hover'],
  ['secondary',     '--color-secondary'],
  ['accent',        '--color-accent'],
];

let cachedBrand = null;
let cachedTheme = null;        // full theme row including light_*/dark_*
let cachedFlags = null;

// Two independent scheme prefs: visitors on the public site and admin sessions
// shouldn't influence each other. Context is derived from the current hash.
const SCHEME_KEYS = {
  public: 'color_scheme_public_v1',
  admin:  'color_scheme_admin_v1',
};
const SCHEME_CHANGE_EVENT = 'color-scheme:change';

function currentContext() {
  return (location.hash || '').startsWith('#/admin') ? 'admin' : 'public';
}

export async function loadBranding() {
  if (cachedBrand && cachedTheme) {
    return { brand: cachedBrand, theme: cachedTheme, flags: cachedFlags };
  }

  const { data, error } = await supabase
    .from('settings')
    .select('*, theme:themes!active_theme_id(*)')
    .eq('id', 1)
    .single();

  if (error) {
    console.warn('[branding] using fallback:', error.message);
    cachedBrand = FALLBACK_BRAND;
    cachedTheme = null;
    cachedFlags = { ...DEFAULT_FLAGS };
  } else {
    cachedBrand = { ...FALLBACK_BRAND, ...data };
    cachedTheme = data.theme || null;
    cachedFlags = { ...DEFAULT_FLAGS, ...(data.flags || {}) };
  }

  installSchemeMediaListener();
  applyBranding(cachedBrand, cachedTheme);
  return { brand: cachedBrand, theme: cachedTheme, flags: cachedFlags };
}

export function getBranding() {
  return cachedBrand ?? FALLBACK_BRAND;
}
export function getTheme() {
  return cachedTheme;
}
export function getFlags() {
  return cachedFlags ?? { ...DEFAULT_FLAGS };
}
export function getFlag(name) {
  return getFlags()[name];
}

/* =====================================================================
 * Color scheme
 *   stored value:        'light' | 'dark' | 'auto'  (default: 'auto')
 *   resolved scheme:     'light' | 'dark'           (auto -> media query)
 * ===================================================================== */
export function getColorSchemePreference(ctx = currentContext()) {
  try {
    const v = localStorage.getItem(SCHEME_KEYS[ctx]);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch { return 'auto'; }
}

export function getResolvedColorScheme(ctx = currentContext()) {
  const pref = getColorSchemePreference(ctx);
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Sets the scheme for the current context (public or admin) and repaints.
export function setColorScheme(next) {
  const ctx = currentContext();
  try {
    if (next === 'auto') localStorage.removeItem(SCHEME_KEYS[ctx]);
    else localStorage.setItem(SCHEME_KEYS[ctx], next);
  } catch {}
  applyBranding(cachedBrand, cachedTheme);
  window.dispatchEvent(new CustomEvent(SCHEME_CHANGE_EVENT, {
    detail: { resolved: getResolvedColorScheme(), pref: getColorSchemePreference(), context: ctx },
  }));
}

export function onColorSchemeChange(handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener(SCHEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(SCHEME_CHANGE_EVENT, listener);
}

// Pull the right palette out of a theme row based on the requested mode.
// Falls back to the FALLBACK_LIGHT/DARK constants column-by-column so a
// half-filled theme still renders something sensible.
export function paletteOf(theme, mode) {
  const fb = mode === 'dark' ? FALLBACK_DARK : FALLBACK_LIGHT;
  const t = theme || {};
  const get = (key) => t[`${mode}_${key}`] || fb[key];
  return Object.fromEntries(PALETTE_KEYS.map(([k]) => [k, get(k)]));
}

let schemeListenerInstalled = false;
function installSchemeMediaListener() {
  if (schemeListenerInstalled) return;
  schemeListenerInstalled = true;
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if (getColorSchemePreference() === 'auto') {
        applyBranding(cachedBrand, cachedTheme);
        window.dispatchEvent(new CustomEvent(SCHEME_CHANGE_EVENT, {
          detail: { resolved: getResolvedColorScheme(), pref: 'auto', context: currentContext() },
        }));
      }
    });
  } catch {}

  // When the user crosses the public<->admin boundary, the active scheme key
  // flips. Repaint so the new context's preference applies immediately.
  let lastContext = currentContext();
  window.addEventListener('hashchange', () => {
    const ctx = currentContext();
    if (ctx === lastContext) return;
    lastContext = ctx;
    applyBranding(cachedBrand, cachedTheme);
    window.dispatchEvent(new CustomEvent(SCHEME_CHANGE_EVENT, {
      detail: { resolved: getResolvedColorScheme(), pref: getColorSchemePreference(), context: ctx },
    }));
  });
}

// Used by the admin Site Settings page so that the next render reflects an
// updated flag without requiring a full reload.
export function _setCachedFlags(flags) {
  cachedFlags = { ...DEFAULT_FLAGS, ...flags };
}

export async function refreshBranding() {
  cachedBrand = null;
  cachedTheme = null;
  cachedFlags = null;
  return loadBranding();
}

// Apply a theme row (in-memory only) for live preview. Honours the current
// scheme so tweaks show up in the mode the admin is currently editing.
export function previewTheme(theme) {
  applyBranding(getBranding(), theme);
}

export function restoreTheme() {
  applyBranding(getBranding(), cachedTheme);
}

function applyBranding(brand, theme) {
  const root = document.documentElement.style;
  const scheme = getResolvedColorScheme();
  document.documentElement.setAttribute('data-color-scheme', scheme);

  const palette = paletteOf(theme, scheme);
  for (const [k, cssVar] of PALETTE_KEYS) {
    if (palette[k]) root.setProperty(cssVar, palette[k]);
  }

  const rgb = hexToRgb(palette.primary);
  if (rgb) {
    root.setProperty('--color-primary-soft', `rgb(${rgb} / 0.08)`);
    root.setProperty('--ring-focus',         `0 0 0 3px rgb(${rgb} / 0.22)`);
  }

  // Brand identity.
  if (brand.font_family) root.setProperty('--font-family', brand.font_family);
  document.title = brand.site_name;
  if (brand.favicon_url) {
    const link = document.getElementById('favicon');
    if (link) link.href = brand.favicon_url;
  }
}

function hexToRgb(hex) {
  if (!hex) return null;
  const m = hex.replace('#', '').match(/^([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!m) return null;
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}
