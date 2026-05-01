-- =====================================================================
-- 17 / Password reset link (admin-configurable)
--   The /forgot-password page sends customers to this URL — typically a
--   wa.me/<admin-phone>?text=… link or a tel: link. Empty disables the
--   link entirely (the page then just shows the explanation + Cancel).
-- =====================================================================

alter table public.settings
  add column if not exists password_reset_url text;
