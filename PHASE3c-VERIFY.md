# Phase 3c — Verify (categories CRUD)

No schema changes — the `categories` and `product_categories` tables already exist from `schema.sql`. This phase swaps the placeholder admin page for a real one.

## What's new

- `src/services/admin-categories.js` — `getAdminCategories()` (with per-category `productCount`), `createCategory`, `renameCategory`, `deleteCategory`. Friendly error message for unique-name collisions.
- `src/pages/admin/categories.js` — list + add form + inline rename + delete with usage warning.
- `src/main.js` — `/admin/categories` now uses the real page.

## Run it

```bash
npm run dev
```

Sign in at `#/admin/login` if needed.

## Verify checklist

### List view
1. Open `#/admin/categories`. The Categories sidebar item is highlighted.
2. You see the four seeded categories alphabetically: Accessories, Apparel, Electronics, Footwear.
3. Each row shows its **usage count** under the name: e.g. "Used by 2 products" for Apparel and Electronics, "Used by 1 product" for Footwear and Accessories.

### Add category
4. In the "New category name" input, type `Wellness` → click **Add** (or press Enter).
5. Toast "Category added", new row appears alphabetically (between "Footwear" and what comes next).
6. The header count goes from "4 categories" to "5 categories".
7. Try adding `Apparel` again (a duplicate). Toast "A category with this name already exists." → no row added.
8. Try adding an empty string → button stays available but the form's HTML5 `required` blocks submit.

### Inline rename
9. Click **Rename** on the new "Wellness" row → row swaps to an input with the name pre-selected, and Cancel / Save buttons.
10. Type `Wellness & Care` → press **Enter** (Save also works). Toast "Renamed", row reverts to display mode with the new name. List re-sorts alphabetically.
11. Click **Rename** on "Apparel" → press **Escape** without changing → row reverts unchanged.
12. Rename a category to a name that already exists (e.g., rename "Wellness & Care" to "Apparel") → toast "A category with this name already exists." → row stays in edit mode so you can fix it.

### Delete with usage warning
13. Click **Delete** on "Apparel" (used by 2 products). The danger dialog says: *"This category is currently tagged on 2 products. The products won't be deleted — they'll just lose this tag."*
14. Click Cancel → category is still there.
15. Click Delete again → confirm → toast "Category deleted", row vanishes, count drops.
16. Click **Delete** on the unused "Wellness & Care" category. The dialog says: *"No products are using this category yet."* → confirm → row vanishes.

### Cascade verification
17. Visit `#/admin/products`. The Apparel-tagged products (Classic Tee, Hoodie Premium) no longer show the Apparel chip. They keep their other categories if any.
18. Visit `#/products` (public site). The category filter chips at the top no longer include "Apparel" or "Wellness & Care". Counts on the remaining chips still match.
19. **In Supabase SQL Editor:** `select * from public.product_categories;` — no rows reference the deleted category id. (The schema's ON DELETE CASCADE handled the cleanup automatically.)

### Empty state
20. Delete all remaining categories (use the danger dialog each time). The list empties, and you see the dashed "No categories yet" empty state. The header reads "No categories yet."
21. Add one back → empty state hides, list reappears.

### Restore for downstream phases
22. Re-create the four seeded categories so Phase 3d/3e tests have data:
    ```
    Apparel
    Footwear
    Accessories
    Electronics
    ```
    Then re-tag a couple of products via `#/admin/products → Edit → Categories` so the public site has filter chips again.

---

When the 22 checks pass, reply **"phase 3c done"** and I'll build **Phase 3d: Reviews + Q&A moderation** (list all reviews and Q&A across products, delete spam, answer questions).
