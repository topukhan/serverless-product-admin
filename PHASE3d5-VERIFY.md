# Phase 3d.5 — Verify (statuses, per-product limits, ratings on cards, friendly 404)

## What's new

### Database
- `supabase/migration-statuses.sql` — adds `enabled boolean default true` to `categories`, `reviews`, `questions`. Updates public-read RLS so disabled rows hide from the public site (admins still see all). Tightens public-INSERT on reviews/questions so a guest can't pre-disable rows.

### New patterns
- `src/components/toggle.js` — reusable switch (used by categories, reviews, questions row toggles)
- `src/services/review-limit.js` — extended with **per-product cap of 1** (in addition to the global cap of 5 per device)
- `src/services/question-limit.js` — new file, **5 questions per product per device**

### Public-side
- Product card now shows **average rating + review count** (sourced from `getCatalog().reviewStats`)
- Review form: name + comment now both required (asterisks shown)
- Review form lock states distinguish "already reviewed this product" vs "global cap hit"
- Question form lock state: "you've asked the maximum questions for this product"
- Disabled categories disappear from the listing's filter chips
- Disabled reviews disappear from the public reviews list (and don't affect the average)
- Disabled questions disappear from the public Q&A list

### Admin
- `categories` page — toggle + "Disabled" pill, dimmed when off
- `reviews` page — toggle + "Hidden" pill, dimmed when off
- `questions` page — toggle + "Hidden from public Q&A" hint, dimmed when off

### 404
- `src/pages/not-found.js` — friendly page (icon + 404 + explanation + "Browse products" CTA + "Go home")
- Wrapped in the public `Layout` (header + footer) via `setNotFoundHandler` injection in main.js

## Step 1 — Apply the migration

In Supabase **SQL Editor**, paste `supabase/migration-statuses.sql` → Run.

**Verify** in Table Editor:
- `categories`, `reviews`, `questions` each have a new `enabled` column, default `true`
- All existing rows show `true`

## Step 2 — Run dev server

```bash
npm run dev
```

## Verify checklist

### Average rating on product cards
1. Open `#/products`. Cards with reviews show stars + average + count under the name (e.g. `★★★★★ 5.0 (1)` on Classic Tee, `★★★★☆ 4.0 (1)` on Hoodie).
2. Cards without reviews don't show the rating row at all (clean cards, no zeros).
3. Open the home page — Featured products show the same rating row.

### Review form: required fields + per-product limit
4. Open any product detail page. Click into the review form. Try to submit with an empty name → red error "Please enter your name."
5. Fill name, try to submit with empty comment → red error "Please write a comment."
6. Both name and comment have a red `*` next to their labels.
7. Submit a valid review on a fresh product (one you haven't reviewed before, e.g. Smartwatch). Toast/post success.
8. Form **immediately swaps to a locked card**: "You've already reviewed this product." with the explanation that you can still review others.
9. Refresh the page — same locked card persists (localStorage).
10. Open a different product (e.g. Belt) — review form is still available. The "X of 5 left" counter has dropped by one.
11. Reset locally if you want to retest:
    ```
    localStorage.removeItem('reviews_per_product_v1');
    localStorage.removeItem('reviews_submitted_v1');
    ```

### Global review cap (5 per device)
12. Submit reviews on 5 different products. After the 5th, the form on every product locks with: "Review limit reached. You've used all 5 reviews available on this device."

### Question form: per-product limit
13. On any product detail page, ask a question. Counter shows "5 of 5 left" before, drops to "4 of 5 left" after, etc.
14. Ask 5 questions on the same product. After the 5th, the form locks: "You've asked the maximum questions for this product."
15. Open a different product — the question form for that one still has "5 of 5 left" (limit is per-product, not global).
16. Reset:
    ```
    localStorage.removeItem('questions_per_product_v1');
    ```

### Categories status
17. Go to `#/admin/categories`. Each row has a small switch on the right + Rename + Delete buttons.
18. Toggle "Apparel" off. Row dims, "Disabled" pill appears, toast "Category disabled".
19. Visit `#/products` — the Apparel filter chip is **gone**. Counts on remaining chips don't include products only-tagged-with-Apparel any longer (because the chip is hidden, not the products).
20. Products tagged with Apparel still appear under "All" if they have other tags or just because of "All" being an unfiltered view.
21. Toggle Apparel back on → chip returns.

### Reviews status (admin → public)
22. Go to `#/admin/reviews`. Each row has a "Show on public site" switch.
23. Toggle a review off. Row dims, "Hidden" pill appears.
24. Open the public detail page for that product → the disabled review is gone. The product card's average and count update accordingly (refresh the listing page).
25. Toggle back on → review returns to public.

### Questions status (admin → public)
26. `#/admin/questions`. Toggle one off. "Hidden from public Q&A" hint appears.
27. Public detail page no longer lists that question.
28. Toggle on → question returns.

### Friendly 404
29. In the URL bar, type a bogus path: e.g. `http://localhost:5173/#/no-such-page`.
30. You see the friendly 404 with magnifier icon, big "404" heading, "We couldn't find that page" message, and **two CTAs**: "Browse products →" (filled, primary) and "Go home" (ghost).
31. The header and footer of the public site still render around the 404 (because it's wrapped in Layout).
32. Click "Browse products" → you land on `#/products`. Click back, then "Go home" → land on `#/`.

### RLS sanity (defense-in-depth)
33. While signed out, run in the browser console:
    ```js
    const { data } = await window.__supabase ?? null;
    ```
    Or simpler — leave Apparel disabled and confirm the public listing's filter chips don't include it. Sign in as admin → `#/admin/categories` shows Apparel is still in the list (admin sees disabled rows).

---

When all 33 checks pass, reply **"phase 3d.5 done"** and I'll move on to **Phase 3e: Branding & themes editor** (site identity, logo/favicon upload, theme switcher, palette editor).
