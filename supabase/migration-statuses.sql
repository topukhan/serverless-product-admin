-- =====================================================================
-- Migration: enabled flags on categories, reviews, questions
-- Each row gets an `enabled` boolean (default true). RLS is updated so
-- public reads only see enabled rows; admins keep seeing everything via
-- the existing `is_admin()` check.
-- Run AFTER schema.sql. Idempotent.
-- =====================================================================

alter table public.categories add column if not exists enabled boolean not null default true;
alter table public.reviews    add column if not exists enabled boolean not null default true;
alter table public.questions  add column if not exists enabled boolean not null default true;

-- ---------- Categories: public read only enabled ----------
drop policy if exists "categories: public read" on public.categories;
create policy "categories: public read"
  on public.categories for select
  using (enabled = true or public.is_admin());

-- ---------- Reviews: public read only enabled ----------
drop policy if exists "reviews: public read" on public.reviews;
create policy "reviews: public read"
  on public.reviews for select
  using (enabled = true or public.is_admin());

-- Public inserts must default to enabled = true. Existing policy allowed any
-- WITH CHECK; tighten so a guest can't pre-disable / hijack the column.
drop policy if exists "reviews: public insert" on public.reviews;
create policy "reviews: public insert"
  on public.reviews for insert
  with check (enabled = true);

-- ---------- Questions: public read only enabled ----------
drop policy if exists "questions: public read" on public.questions;
create policy "questions: public read"
  on public.questions for select
  using (enabled = true or public.is_admin());

drop policy if exists "questions: public insert" on public.questions;
create policy "questions: public insert"
  on public.questions for insert
  with check (answer is null and enabled = true);
