# Phase 3b — Verify (products CRUD + image upload + site settings)

This phase delivers:
- `/admin/products` list with search + edit + delete
- `/admin/products/new` and `/admin/products/:id` form (same component) with image upload to Supabase Storage
- `/admin/site-settings` — first feature flag (`show_stock`), structured to grow

## What's new

### Database
- `supabase/migration-flags.sql` — adds `settings.flags jsonb` (default `{"show_stock": true}`). Idempotent.

### Frontend services
- `src/services/admin-products.js` — `getAdminProducts`, `getAdminProduct`, `getAllCategories`, `createProduct`, `updateProduct`, `deleteProduct`, `uploadProductImage`, `pathFromPublicUrl`
- `src/services/branding.js` — extended to load `flags`, exposes `getFlags()`, `getFlag(name)`, `_setCachedFlags(flags)`. New `DEFAULT_FLAGS` constant lists known toggles.

### Frontend components / pages
- `src/components/image-uploader.js` — file upload + URL paste in one, with preview / replace / remove
- `src/pages/admin/products-list.js` — list with search and per-row Edit / Delete
- `src/pages/admin/product-edit.js` — new + edit form (name, description, price, stock, thumbnail, gallery × 3, categories)
- `src/pages/admin/site-settings.js` — feature-flag toggles
- `src/components/admin-layout.js` — added "Site settings" sidebar item

### Public site
- `product-card.js`, `product-detail.js`, `cart.js` — respect `show_stock` flag (Sold out always shows; counts/Only-X hide when flag is off)

## Step 1 — Apply the flags migration

In Supabase **SQL Editor**, paste `supabase/migration-flags.sql` → Run.

**Verify** in Table Editor → `settings`:
- A new `flags` column exists, type `jsonb`
- The id=1 row has `flags = {"show_stock": true}`

## Step 2 — Run dev server

```bash
npm run dev
```

Sign in at `#/admin/login`.

## Verify checklist

### Admin sidebar
1. The sidebar now has a **Site settings** item (with a sliders icon) at the bottom of the nav.
2. Clicking it routes to `#/admin/site-settings`.

### Products list (`#/admin/products`)
3. List shows all 6 seeded products as cards: thumbnail, name, price (in `৳`), stock, category chips, gallery count (e.g. "Gallery: 3"), and Edit / Delete buttons.
4. Header shows "6 products" count and a `+ New product` button.
5. Type "tee" in the search box → list narrows to "Classic Tee", count switches to "1 of 6 matching".
6. Clear the search → all 6 reappear.

### Edit existing product
7. Click **Edit** on any product → land on `#/admin/products/<uuid>`.
8. Form is pre-filled: name, description, price (number), stock, thumbnail (with image), gallery slots (filled with the seed URLs), categories (correct ones checked).
9. Change the **stock** to `42` → click **Save** at the top or bottom → toast "Product updated", you land back on the list. The edited product shows stock 42.
10. Click **Edit** on the same product again → confirm the change persisted.

### New product with file upload
11. Click **+ New product** → land on `#/admin/products/new`. Form is empty.
12. **Thumbnail uploader** — click the dashed dropzone → system file picker opens → pick any image from your computer.
13. Briefly see "Uploading…" with a spinner, then the image renders in the slot with **Replace** and **Remove** overlay buttons.
14. **In Supabase Dashboard → Storage → products bucket** — confirm a new file exists (UUID-named).
15. Fill: Name = "Test product", Price = `99`, Stock = `5`, pick a category. Click **Save**.
16. Toast "Product created", you land on the list. The new product is at the top with your uploaded image.

### New product with URL paste
17. **+ New product** again. In the Thumbnail's URL input below the dropzone, paste:
    `https://picsum.photos/seed/manual/600/600`
    Hit Tab or click elsewhere → image preview appears in the slot (no upload, just hot-link).
18. Add a name and price → Save. Confirms external URLs work without going through Storage.

### Gallery
19. Edit any product → fill all 3 gallery slots (mix of file uploads and URLs is fine). Save.
20. Visit the public detail page for that product (`#/product/<id>`) — main image + 4-thumbnail strip.
21. Edit again → remove the middle gallery slot → Save. Refresh the public page — only thumbnail + 2 gallery thumbs.

### Empty gallery (no slots filled)
22. Create a new product with thumbnail only, no gallery. Save. Visit its detail page — no thumbnail strip below the main image. Just the single hero image.

### Delete with confirmation
23. On the products list, click **Delete** on the "Test product" you created.
24. The polished danger dialog appears: "Delete \"Test product\"?".
25. Click **Cancel** → still in the list, product still there.
26. Click Delete again → click **Delete product** → toast "Product deleted", row vanishes.
27. **Storage check** — the uploaded file's UUID is no longer in the `products` bucket (orphan cleanup ran). External-URL-only products leave the URL alone (it wasn't ours).

### Site settings — show_stock flag
The flag controls whether the **exact quantity** is revealed, not whether stock state is shown. "Sold out" always appears because it explains a disabled Add-to-cart.

| Surface | Flag ON | Flag OFF |
|---|---|---|
| Detail page (≥ 5 stock) | "30 in stock" | "In stock" |
| Detail page (< 5 stock) | "Only 3 left" | "In stock" |
| Product card (low only) | "Only 3 left" | "Low stock" |
| Cart row (qty > stock) | "Only 3 in stock" | "Limited stock" |

28. Go to `#/admin/site-settings`. You see one toggle: "Show exact stock quantity on the public site", on by default.
29. **Flag ON** — visit `#/product/<some Headphones uuid>` (stock 12). The status line reads "**12 in stock**" (green). Visit a product with low stock (set one via Edit to stock=3) — reads "**Only 3 left**" (amber).
30. Click the toggle off → animates off → toast "Turned off".
31. **Flag OFF** — refresh that detail page. The same item now reads just "**In stock**" (green) — no number. The low-stock product reads "**In stock**" too on detail, and shows a generic "**Low stock**" badge on its product card.
32. Set a product to `stock = 0` (Edit form) — "**Sold out**" badge appears in both modes, regardless of flag.
33. Toggle the flag back on → numbers reappear everywhere.

### Sanity: no native popups anywhere
34. Sign out from the admin sidebar — uses the polished confirm dialog (not native).
35. Cart > Clear cart on `#/cart` — uses the polished danger dialog with toast.

---

When all 35 checks pass, reply **"phase 3b done"** and I'll build **Phase 3c: Categories CRUD** (create / rename / delete categories, with linked-product warning on delete).

## Notes on storage

- Uploads go to the `products` bucket as `<uuid>.<ext>` paths. The bucket is public, so the URL works directly in `<img>` tags.
- RLS allows admin uploads only (`storage: admin write products` policy). A signed-out user attempting an upload would get a 403.
- File size: Supabase free tier caps individual uploads at 50MB and the project at 1GB. No client-side size limit is enforced — you can add one if needed.
- Orphan cleanup: deleting a product also removes its uploaded files from storage. External (picsum, etc.) URLs are skipped.

## Notes on the flags system

To add another site-wide toggle later:
1. Add the key + default to `DEFAULT_FLAGS` in `src/services/branding.js`.
2. Add an entry to `FLAG_SCHEMA` in `src/pages/admin/site-settings.js` (with `key`, `title`, `description`).
3. Read it in any component via `getFlag('your_new_flag')`.
4. (Optional) Update `migration-flags.sql` to merge the new default into existing rows.

No schema changes needed — `flags` is a `jsonb` blob.
