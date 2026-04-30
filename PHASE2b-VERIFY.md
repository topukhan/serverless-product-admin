# Phase 2b — Verify

## What's new

- `src/services/products.js` — `getCatalog()`, `getProduct(id)`, `formatPrice()`
- `src/components/product-card.js` — product card (image, name, price, stock badge)
- `src/pages/products.js` — listing page with category filter chips
- `supabase/seed.sql` — sample categories + products + a couple of reviews/questions
- `src/main.js` — `/products` route now uses the real page

The product details page (`/product/:id`) is still a placeholder — that's Phase 2c.

## Step 1 — Seed sample data

Open Supabase **SQL Editor → New query**, paste `supabase/seed.sql`, **Run**.

Verify in **Table Editor → products**: you should see 6 rows.

(If you skip the seed, the listing page just shows an empty state.)

## Step 2 — Run dev server

```bash
npm run dev
```

## Verify checklist

1. **Home page still works** — title, branding, swatches all good.
2. **Click "Products" in the header.** You should see a 2-/3-/4-column grid of 6 product cards (Tee, Hoodie, Sneakers, Belt, Headphones, Watch) with images.
3. **Filter chips** appear above the grid: All, Apparel, Footwear, Accessories, Electronics. Click any one — grid filters down. Click "All" — restores.
4. **Active filter chip** is filled with your primary brand color.
5. **Cards** show name, truncated description, price formatted as `$19.99`, and a stock badge if stock < 5.
6. **Hover a card** — slight border + shadow change, image scales subtly.
7. **Click a card** — URL changes to `#/product/<uuid>`, you land on the placeholder for now. That's expected — Phase 2c builds the real details page.
8. **Console clean** — no red errors.

## Live data test

Run in SQL Editor:

```sql
update public.products set stock = 0 where name = 'Classic Tee';
```

Refresh `#/products`. The Tee card should now show a red **Out of stock** badge. Revert:

```sql
update public.products set stock = 50 where name = 'Classic Tee';
```

---

When the 8 checks pass, reply **"phase 2b done"** and I'll build Phase 2c: real Product Details page with reviews + Q&A submission.
