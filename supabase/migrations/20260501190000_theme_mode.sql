-- =====================================================================
-- Migration: Themes own their light/dark mode
-- Each palette is fundamentally either a light theme or a dark theme.
-- Annotating it on the row removes the confusion of seeing a clearly-
-- light palette like "Sand" listed under "Dark mode theme".
-- Run AFTER prior migrations. Idempotent.
-- =====================================================================

alter table public.themes
  add column if not exists mode text not null default 'light';

alter table public.themes drop constraint if exists themes_mode_check;
alter table public.themes add constraint themes_mode_check
  check (mode in ('light','dark'));

-- Tag the seeded themes correctly. Idempotent — won't override admin edits
-- once they exist on a different value.
update public.themes set mode = 'dark'
 where name = 'Midnight' and mode <> 'dark';

update public.themes set mode = 'light'
 where name in ('Sand','Slate','Forest') and mode <> 'light';
