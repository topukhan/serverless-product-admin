# Supabase Product Showcase

A self-hostable product showcase + admin panel built on Vite, vanilla JS, Tailwind, and Supabase. Free-tier-friendly: deploy to Vercel + Supabase in ~10 minutes.

**Features**
- Product catalog with categories, gallery, reviews, and Q&A
- Guest cart (localStorage) + Taka (৳) pricing
- Admin panel: products, categories, reviews, questions, branding & themes, site settings
- Theme palette editor with live preview
- Logo + favicon upload
- Auto WebP conversion + downscale for any uploaded image
- Per-device limits for guest reviews/questions (anti-spam)
- Row-level security on every table

---

## Local development

```bash
npm install
cp .env.example .env   # then paste your Supabase URL + anon key
npm run dev
```

Open http://localhost:5173.

---

## Deployment Guide (Vercel + Supabase Free Tier)

### 1. Push to GitHub first
```bash
git init && git add . && git commit -m "initial"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Create Supabase project
1. [supabase.com](https://supabase.com) → New project → choose free tier region.
2. **Project Settings → API** → copy **Project URL** and **anon public key**.

### 3. Apply the schema (no copy-paste needed)

Use the Supabase CLI via `npx` (no global install):
```bash
npx supabase --version
npx supabase login
```

Link your project:
```bash
npx supabase link --project-ref <your-project-ref>
# project-ref = the ID in your Supabase URL, e.g. qtlqwirpwaigtkxbcsci
```

Push every migration in one go:
```bash
npx supabase db push
```

This applies every file in `supabase/migrations/` in order. No manual SQL editor work needed.

> **Future schema changes:** create `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql` and run `npx supabase db push` again.

### 4. Create `.env` (local) and set env vars in Vercel
```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 5. Deploy to Vercel
1. [vercel.com](https://vercel.com) → New Project → Import from GitHub.
2. Framework: **Vite** (auto-detected).
3. Add the two env vars from step 4 under **Environment Variables**.
4. Deploy → done.

### 6. Create your admin user
After deploy, follow `supabase/SETUP.md` Steps 2–3 (create an auth user + insert their UID into `admins`). That's the only manual SQL Editor step.

---

## Ongoing maintenance

- **Schema change** → add a migration file → `npx supabase db push`
- **Code change** → `git push` → Vercel auto-redeploys
- **No Supabase restarts** needed on free tier
- **Backups**: Supabase free tier keeps daily snapshots automatically

---

## Project structure

```
src/
  components/   # reusable UI (header, footer, cart, dialogs, image uploader…)
  pages/        # public pages + admin pages
  services/     # supabase client, auth, products, branding, cart, etc.
  lib/          # tiny helpers (DOM, image → WebP)
  styles/       # Tailwind entry + design tokens
supabase/
  migrations/   # ordered SQL migrations (run via supabase db push)
  SETUP.md      # one-time admin-user setup
```

---

## License

MIT — use it, fork it, sell on top of it.
