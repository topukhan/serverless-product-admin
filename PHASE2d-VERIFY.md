# Phase 2d — Verify (theming + cart + review limit + calmer UI)

## What's new

### Database
- `supabase/migration-themes.sql` — adds `themes` table + `settings.active_theme_id`. Seeds three themes: **Sand** (default, Hayatiq-like cream + sage), **Slate** (cool gray + navy), **Forest** (green + deep forest).

### Theme system
- `src/services/branding.js` — fetches active theme, applies full palette as CSS vars
- `src/styles/main.css` — token set expanded to bg / surface / border / text / muted / primary / primary-hover / secondary / accent. Calmer defaults.
- `tailwind.config.js` — new color utilities: `bg-bg`, `bg-surface`, `border-border`, `text-text`, `text-muted`, `text-primary`, `bg-primary`, etc.

### Cart (guest, localStorage)
- `src/services/cart.js` — `addToCart`, `setQty`, `removeFromCart`, `clearCart`, live `cart:change` event
- `src/components/cart-icon.js` — header icon with count badge that updates live
- `src/pages/cart.js` — full cart page with qty controls, per-item totals, summary panel
- Product detail "Add to cart" now actually adds and shows a brief confirmation
- New route `#/cart`

### Review limit
- `src/services/review-limit.js` — tracks submissions in localStorage, max 5 per device
- `src/components/review-form.js` — shows "X of 5 left", locks the form once at 0

### Calmer UI
- Hero gradient blobs removed
- Body uses `--color-bg` (warm cream by default)
- Header: surface bg + border instead of bright white/blur
- Card / borders / muted text all theme-driven
- Highlights cards simplified (left vertical accent bar instead of emoji squares)
- Smaller, more text-focused hero

## Step 1 — Apply the theme migration

In Supabase **SQL Editor**, paste `supabase/migration-themes.sql` → Run.

**Verify** in Table Editor:
- `themes` table exists with 3 rows: Sand, Slate, Forest
- `settings` row: `active_theme_id` is set (points to Sand by default)

## Step 2 — Run dev server

```bash
npm run dev
```

## Verify checklist

### Calm look
1. **Page background** is warm cream (~`#f7f3ed`), not bright white.
2. **Primary color** is sage green (`#5a6b4a`), used on the logo square, buttons, links, "Featured" link, cart icon hover, etc.
3. **No gradient blobs** on the home page hero.
4. **Cards** use the surface color (white) with a soft border, not heavy shadow.

### Header
5. Cart icon (shopping cart SVG) on the right of the nav.
6. Badge appears with item count after you add to cart, hidden when empty.

### Cart flow
7. Open a product → click **Add to cart** → button shows "Added to cart ✓" briefly, header badge increments.
8. Add the same product twice → quantity increments instead of duplicating.
9. Click the cart icon → land on `#/cart` with the items.
10. Use **+ / −** to change qty; row total + summary update live.
11. Click **Remove** on an item — it disappears.
12. Click **Clear cart** — confirms and empties; you see the empty state.
13. Empty cart shows "Your cart is empty" with a Browse button.

### Review limit
14. Submit a review on any product. The form's "X of 5 left" counter drops by one.
15. Submit four more (any products). After the 5th, the form replaces itself with the locked card: "You've reached the review limit for this device (5 reviews). Thanks for your input!"
16. Reset by running this in browser console: `localStorage.removeItem('reviews_submitted_v1')` — refresh, form is back.

### Theme switching (the headline feature)
17. In Supabase **SQL Editor**:
    ```sql
    update public.settings
       set active_theme_id = (select id from public.themes where name = 'Slate')
     where id = 1;
    ```
    Refresh the browser. Bg becomes cool gray, primary becomes deep navy, accent becomes warm tan.
18. Try `'Forest'` — bg goes green-tinted, primary deep forest green.
19. Back to `'Sand'` to revert.

### Accessibility
20. Tab through the page. Focused buttons/links/inputs show a soft glow ring in the active primary color.

---

When the 20 checks pass, reply **"phase 2d done"** and I'll start Phase 3: the admin panel — auth, product CRUD, image upload, theme & branding editor.

## How admin will switch themes (preview)

In Phase 3, the branding settings page will:
- Show a list of themes (cards with palette swatches)
- Highlight the active one
- Click "Apply" → updates `settings.active_theme_id` → public site picks it up on next load
- Optional: edit each theme's individual colors, or duplicate a theme as a starting point
