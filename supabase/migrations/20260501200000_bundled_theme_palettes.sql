-- =====================================================================
-- Migration: Bundled theme palettes (light + dark in one theme)
-- A theme is now a complete brand: it owns both a light palette and a
-- dark palette. Admin picks ONE active theme. Visitors flip between the
-- active theme's two variants via the header sun/moon toggle.
--
-- Migration strategy:
--   1. Add 9 light_* and 9 dark_* columns
--   2. Backfill light_* from the existing single-palette columns
--   3. Backfill dark_* from a sensible default (Midnight) for every theme
--   4. For the Midnight theme specifically, swap so its own colors live
--      in dark_* and a light fallback (Sand) lives in light_*
--   5. Leave the old single-palette columns intact for now — read code
--      uses the new columns, but the old data isn't destructively dropped.
-- Run AFTER prior migrations. Idempotent.
-- =====================================================================

alter table public.themes
  add column if not exists light_bg              text,
  add column if not exists light_surface         text,
  add column if not exists light_border          text,
  add column if not exists light_text            text,
  add column if not exists light_muted           text,
  add column if not exists light_primary         text,
  add column if not exists light_primary_hover   text,
  add column if not exists light_secondary       text,
  add column if not exists light_accent          text,
  add column if not exists dark_bg               text,
  add column if not exists dark_surface          text,
  add column if not exists dark_border           text,
  add column if not exists dark_text             text,
  add column if not exists dark_muted            text,
  add column if not exists dark_primary          text,
  add column if not exists dark_primary_hover    text,
  add column if not exists dark_secondary        text,
  add column if not exists dark_accent           text;

-- Step 1: light side from existing single palette (only fill where empty).
update public.themes set
  light_bg            = bg,
  light_surface       = surface,
  light_border        = border,
  light_text          = text_color,
  light_muted         = muted,
  light_primary       = primary_color,
  light_primary_hover = primary_hover,
  light_secondary     = secondary_color,
  light_accent        = accent_color
where light_bg is null;

-- Step 2: dark side defaults to Midnight palette (only fill where empty).
update public.themes set
  dark_bg            = '#0f1115',
  dark_surface       = '#1a1d23',
  dark_border        = '#2a2e36',
  dark_text          = '#e8e6e1',
  dark_muted         = '#9aa0a8',
  dark_primary       = '#9bb886',
  dark_primary_hover = '#a8c690',
  dark_secondary     = '#7a8a6e',
  dark_accent        = '#d4a373'
where dark_bg is null;

-- Step 3: For the legacy "Midnight" theme, the existing colors ARE the dark
-- palette — re-anchor it: light_* = Sand defaults, dark_* = its own colors.
update public.themes set
  light_bg = '#f7f3ed', light_surface = '#ffffff', light_border = '#e8e1d4',
  light_text = '#1f1c18', light_muted = '#6b6358',
  light_primary = '#5a6b4a', light_primary_hover = '#4a5a3c',
  light_secondary = '#a89580', light_accent = '#c8956d',
  dark_bg = bg, dark_surface = surface, dark_border = border,
  dark_text = text_color, dark_muted = muted,
  dark_primary = primary_color, dark_primary_hover = primary_hover,
  dark_secondary = secondary_color, dark_accent = accent_color
where name = 'Midnight';
