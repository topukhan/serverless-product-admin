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
};

// Defaults for site-level feature flags. Add a key here AND in the schema
// migration if you introduce a new flag.
export const DEFAULT_FLAGS = {
  show_stock: true,
  show_sold:  true,
};

const FALLBACK_THEME = {
  name: 'Sand',
  bg: '#f7f3ed',
  surface: '#ffffff',
  border: '#e8e1d4',
  text_color: '#1f1c18',
  muted: '#6b6358',
  primary_color: '#5a6b4a',
  primary_hover: '#4a5a3c',
  secondary_color: '#a89580',
  accent_color: '#c8956d',
};

// Map theme columns -> CSS variables.
const THEME_TOKEN_MAP = {
  bg:              '--color-bg',
  surface:         '--color-surface',
  border:          '--color-border',
  text_color:      '--color-text',
  muted:           '--color-muted',
  primary_color:   '--color-primary',
  primary_hover:   '--color-primary-hover',
  secondary_color: '--color-secondary',
  accent_color:    '--color-accent',
};

let cachedBrand = null;
let cachedTheme = null;
let cachedFlags = null;

export async function loadBranding() {
  if (cachedBrand && cachedTheme) return { brand: cachedBrand, theme: cachedTheme, flags: cachedFlags };

  // Fetch the settings row + its active theme in one round-trip.
  const { data, error } = await supabase
    .from('settings')
    .select('*, theme:themes!active_theme_id(*)')
    .eq('id', 1)
    .single();

  if (error) {
    console.warn('[branding] using fallback:', error.message);
    cachedBrand = FALLBACK_BRAND;
    cachedTheme = FALLBACK_THEME;
    cachedFlags = { ...DEFAULT_FLAGS };
  } else {
    cachedBrand = { ...FALLBACK_BRAND, ...data };
    cachedTheme = data.theme ? { ...FALLBACK_THEME, ...data.theme } : FALLBACK_THEME;
    cachedFlags = { ...DEFAULT_FLAGS, ...(data.flags || {}) };
  }

  applyBranding(cachedBrand, cachedTheme);
  return { brand: cachedBrand, theme: cachedTheme, flags: cachedFlags };
}

export function getBranding() {
  return cachedBrand ?? FALLBACK_BRAND;
}
export function getTheme() {
  return cachedTheme ?? FALLBACK_THEME;
}
export function getFlags() {
  return cachedFlags ?? { ...DEFAULT_FLAGS };
}
export function getFlag(name) {
  return getFlags()[name];
}

// Used by the admin Site Settings page so that the next render reflects an
// updated flag without requiring a full reload.
export function _setCachedFlags(flags) {
  cachedFlags = { ...DEFAULT_FLAGS, ...flags };
}

// Refetch settings + active theme and re-apply CSS vars / document title /
// favicon. Called by the admin Branding page after any save so the change is
// visible immediately, without a full page reload.
export async function refreshBranding() {
  cachedBrand = null;
  cachedTheme = null;
  cachedFlags = null;
  return loadBranding();
}

// Apply a theme palette object (in-memory only). Used for live preview while
// the admin is editing a theme — does not persist anything.
export function previewTheme(theme) {
  applyBranding(getBranding(), { ...FALLBACK_THEME, ...theme });
}

// Restore the saved active theme after a preview.
export function restoreTheme() {
  applyBranding(getBranding(), getTheme());
}

function applyBranding(brand, theme) {
  const root = document.documentElement.style;

  // Theme palette → CSS vars.
  for (const [col, cssVar] of Object.entries(THEME_TOKEN_MAP)) {
    if (theme[col]) root.setProperty(cssVar, theme[col]);
  }

  // Derived tokens from primary.
  const rgb = hexToRgb(theme.primary_color);
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
