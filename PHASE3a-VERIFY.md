# Phase 3a — Verify (admin auth + shell + dashboard)

This is the first slice of Phase 3. It gives you:
- `/admin/login` — sign in form (no signup; admins are added manually in Supabase)
- `/admin` — dashboard with stat cards + low-stock + latest reviews
- Sidebar shell with placeholders for Products, Categories, Reviews, Questions, Branding (built in 3b–3e)
- Sign-out flow with the new dialog
- Route guard — non-admin users get a "Not authorized" page; signed-out users redirect to login

## What's new

- `src/services/auth.js` — `signIn`, `signOut`, `getSession`, `getUser`, `isAdmin` (calls the SQL `is_admin()` RPC), `onAuthChange`
- `src/services/admin-guard.js` — `requireAdmin(renderFn)` wrapper for admin routes
- `src/components/admin-layout.js` — sidebar shell (responsive: collapses on mobile via hamburger), inline icon set, sign-out button
- `src/pages/admin/login.js` — login page (auto-redirects if already signed in as admin)
- `src/pages/admin/dashboard.js` — stat cards + low-stock list + latest reviews
- `src/pages/admin/coming-soon.js` — placeholder for unbuilt admin pages
- Footer now has an "Admin" link in the About column
- `src/main.js` — wires `/admin/login`, `/admin`, `/admin/products`, `/admin/categories`, `/admin/reviews`, `/admin/questions`, `/admin/branding` (last five are placeholders)

## Prereq — make sure your admin user exists

If you didn't already do this in Phase 1 Step 2, do it now:

1. **Supabase → Authentication → Users → Add user → Create new user**. Tick **Auto Confirm User**, set an email + password.
2. Copy the user's **UID**.
3. **SQL Editor**:
   ```sql
   insert into public.admins (user_id) values ('PASTE-UID-HERE')
   on conflict (user_id) do nothing;
   ```

## Run it

```bash
npm run dev
```

## Verify checklist

### Login flow
1. Open `#/admin`. You're redirected to `#/admin/login` (no session).
2. Try a wrong password → red error appears in the form.
3. Sign in with correct credentials → toast "Welcome back" appears, you land on `#/admin` (dashboard).
4. Refresh the page on `#/admin` — you stay (session persists in localStorage via Supabase SDK).

### Non-admin sign-in (optional but worth testing)
5. In Supabase, create a second user (do NOT add them to `admins`). Sign in as that user → you see the **"Not authorized"** card with two buttons. Click "Switch account" → returns to login. Sign back in as the real admin.

### Dashboard
6. **Stat cards** — Products / Categories / Reviews / Questions / Themes — show real counts from your database.
7. **Low stock** card lists up to 5 products ordered by stock ascending. Out-of-stock items are red, < 5 are amber.
8. **Latest reviews** card shows the 3 most recent with stars + comment preview.

### Sidebar / nav
9. On desktop (≥ 1024px wide), sidebar is sticky on the left, dashboard nav item highlighted.
10. On mobile (< 1024px), sidebar collapses to a top bar; the hamburger toggles the nav links.
11. Click each nav item — Products / Categories / Reviews / Questions / Branding all show the "Coming soon" placeholder with the right phase label.
12. Click the **Admin** logo in the sidebar header → returns to `#/` public site.

### Sign out
13. Click **Sign out** at the bottom of the sidebar → polished confirm dialog appears.
14. Cancel → still signed in.
15. Confirm → toast "Signed out", redirect to login. Visiting `#/admin` again redirects you back to login.

### Public footer
16. From the public site footer, the new **Admin** link routes to `#/admin` (and through the guard).

---

When all 16 checks pass, reply **"phase 3a done"** and I'll build **Phase 3b: Products CRUD** with image upload to Supabase Storage (thumbnail + gallery), category multi-select, and the form validations.

## Heads-up on Storage for Phase 3b

Supabase Storage buckets `products` and `branding` already exist (created in `schema.sql`) with admin-write RLS. The admin product editor will let you:
- **Upload** images directly from your computer (multipart upload via the Supabase JS SDK) → stored in the `products` bucket → public URL saved into `image_url` / `gallery_urls`
- **OR paste an external URL** (like the picsum samples currently in your seed data) — useful for quick testing or hot-linking

Both options will be available in the same form.
