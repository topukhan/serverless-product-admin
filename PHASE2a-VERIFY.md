# Phase 2a — Verify

## What's in place

```
supebase-site/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env             ← your Supabase URL + anon key
├── .env.example
├── public/
│   └── favicon.svg
├── src/
│   ├── main.js                     ← entry; boots branding + router
│   ├── styles/main.css             ← tailwind + CSS variable defaults
│   ├── services/
│   │   ├── supabase.js             ← Supabase client
│   │   ├── branding.js             ← fetches `settings`, applies CSS vars
│   │   └── router.js               ← hash router (#/, #/products, …)
│   ├── components/
│   │   ├── header.js
│   │   ├── footer.js
│   │   └── layout.js               ← wraps page with header + footer
│   └── pages/
│       ├── home.js
│       └── placeholder.js          ← stand-in for Phase 2b/2c routes
└── supabase/
    ├── schema.sql
    └── SETUP.md
```

## Run it

```bash
npm run dev
```

It should auto-open `http://localhost:5173`.

## Verify checklist

1. **Page loads.** You see the Home page with "Welcome to **My Store**" heading.
2. **Tab title** says `My Store` (not `Loading…` and not `Vite + …`). This proves branding loaded from Supabase.
3. **Three color swatches** at the bottom show the hex values from your `settings` row.
4. **Console is clean** — no red errors. (A `[branding] using fallback` warning means RLS or the row is wrong; tell me if you see it.)
5. **Routing** — click "Products" in the header; URL becomes `#/products`, page changes to a "Coming in the next phase" placeholder. Click the logo to return.

## Live branding test (proves dynamic updates work)

In Supabase **SQL Editor**, run:

```sql
update public.settings
set site_name = 'Topu Store', primary_color = '#16a34a'
where id = 1;
```

Refresh the browser. The header name and the primary color (button, accent square) should change to green and "Topu Store". Revert with:

```sql
update public.settings
set site_name = 'My Store', primary_color = '#4f46e5'
where id = 1;
```

---

When all 5 checklist items pass, reply **"phase 2a done"** and I'll build Phase 2b: real Product Listing + Product Details pages backed by your `products` / `reviews` / `questions` tables.
