# Phase 2e — Verify (gallery + redesigned product card)

## What's new

### Database
- `supabase/migration-gallery.sql` — adds `products.gallery_urls text[]`, capped at 3 per product (check constraint). Backfills the seeded products with sample gallery images so you can see all four states (3 / 2 / 1 / 0 gallery images).

### Frontend
- `src/components/gallery.js` — new `Gallery` component: large main image + clickable thumbnail strip below. Click to set, hover to preview. Active thumbnail highlighted with primary color border.
- `src/pages/product-detail.js` — uses `Gallery` instead of the old single-image block.
- `src/components/product-card.js` — redesigned:
  - Image hover-swap to first gallery image (when present)
  - Stock badge top-left, gallery count chip bottom-right (e.g. `+3`)
  - Cleaner footer: bigger price + circular **+** quick-add button
  - Click **+** → adds to cart, button briefly turns into a checkmark, header badge updates
  - Removed the always-on description (was misaligned filler — detail page has it)

## Step 1 — Apply the gallery migration

In Supabase **SQL Editor**, paste `supabase/migration-gallery.sql` → Run.

**Verify** in Table Editor → `products`:
- new `gallery_urls` column visible
- Classic Tee: 3 URLs · Hoodie: 2 · Sneakers: 1 · Belt: empty `{}` · Headphones: 3 · Watch: empty `{}`

## Step 2 — Run dev server

```bash
npm run dev
```

## Verify checklist

### Product card (listing page)
1. Open `#/products`. Cards have **no description text** anymore — cleaner stack.
2. Cards with gallery images show a small `+1`, `+2`, or `+3` chip in the bottom-right of the image (Tee `+3`, Hoodie `+2`, Sneakers `+1`, Headphones `+3`). Belt and Watch have no chip.
3. **Hover a card with a gallery** (Tee, Hoodie, Sneakers, Headphones): the main image cross-fades to the first gallery image. Move mouse away → fades back.
4. Hover any card: card lifts slightly with a soft shadow; image scales subtly.
5. Footer shows **price** (large, primary color) and a circular **+** button on the right.
6. Click the **+** button on a card: it adds to cart, the button briefly fills with primary color and shows a ✓, then resets. Header cart badge increments.
7. Click an out-of-stock card's **+** button: nothing happens (button is disabled). Run this to test:
   ```sql
   update public.products set stock = 0 where name = 'Classic Tee';
   ```
   Refresh — Tee shows **Sold out** badge top-left and **+** button is greyed/disabled. Revert with `stock = 50`.

### Product gallery (detail page)
8. Open **Classic Tee** detail. You see the main thumbnail image + a strip of **4** thumbnails below it (the original + 3 gallery). The first thumbnail has a primary-color border (active).
9. **Click thumbnail #2** — main image swaps. Border highlight moves to thumbnail #2.
10. **Hover** thumbnails — main image previews them; mouse-leave restores the active one.
11. Open **Wireless Headphones** — same: 4 thumbnails (1 thumb + 3 gallery).
12. Open **Hoodie Premium** — 3 thumbnails (1 thumb + 2 gallery).
13. Open **Runner Sneakers** — 2 thumbnails (1 thumb + 1 gallery).
14. Open **Leather Belt** — only the main image, **no thumbnail strip** (gallery is empty). This is the "fallback" case you described.
15. Open **Smartwatch** — same: no strip.

### Responsive
16. Resize the window down to mobile width (~375px):
    - Detail page stacks: gallery on top, info below.
    - Thumbnail strip stays as 4 columns, just smaller — comfortable to tap.
    - Product card grid drops to 2 columns; **+** button still tappable.

### End-to-end sanity
17. From the listing, click **+** on three different products → cart icon shows 3.
18. Open `#/cart` — three rows; each row links back to its detail page.

---

When all 18 checks pass, reply **"phase 2e done"** and I'll start **Phase 3: the admin panel** (auth + dashboard + product CRUD with gallery upload + branding/theme editor).

## Future admin notes

When admin panel arrives, the product editor will include:
- Thumbnail uploader (single image → `image_url`)
- Gallery uploader (up to 3 images → `gallery_urls`, with reorder + remove)
- Both write to the `products` Storage bucket; URLs are stored as text in the table.
