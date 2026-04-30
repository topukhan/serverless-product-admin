-- =====================================================================
-- Migration: Configurable delivery zone labels
-- Admin-editable text shown next to each zone at checkout. The underlying
-- zone keys (inside_dhaka / outside_dhaka) stay fixed; only the display
-- label changes. Run AFTER 20260501110000_delivery_zones.sql. Idempotent.
-- =====================================================================

alter table public.settings
  add column if not exists delivery_label_inside_dhaka  text not null default 'Inside Dhaka',
  add column if not exists delivery_label_outside_dhaka text not null default 'Outside Dhaka';
