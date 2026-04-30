-- =====================================================================
-- Migration: site feature flags
-- Adds `settings.flags jsonb` for boolean (or other JSON) toggles.
-- New flags default to true if not present in the row.
-- Run AFTER schema.sql. Idempotent.
-- =====================================================================

alter table public.settings
  add column if not exists flags jsonb not null default '{}'::jsonb;

-- Ensure default flags exist on the singleton row. Merge in any missing keys
-- so a re-run after the admin has tweaked flags doesn't overwrite their work.
update public.settings
   set flags = '{"show_stock": true}'::jsonb || coalesce(flags, '{}'::jsonb)
 where id = 1;
