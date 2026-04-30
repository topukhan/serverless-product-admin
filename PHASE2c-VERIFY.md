# Phase 2c — Verify

## What's new

### Design system upgrade
- `src/styles/main.css` — full token set (radius, shadow, container width, section padding, focus ring) as CSS variables
- `tailwind.config.js` — `rounded-md`, `shadow-md`, `max-w-container` etc. now resolve to those vars
- `src/services/branding.js` — generic `TOKEN_MAP` so adding a new admin-controllable token = add one line + one column

### UI polish
- **Header** — subtle blur, active-route highlight, refined nav pills
- **Footer** — three-column with sections, brand mark, links
- **Home** — proper hero with gradient blobs, status pill, CTA pair, Featured products row, Highlights cards
- **Product card** — softer shadow, hover lift, repositioned stock badge as overlay
- **Products listing** — filter chips show count per category

### Phase 2c features (Product Details)
- `src/services/reviews.js`, `services/questions.js` — fetchers + create helpers
- `src/components/stars.js` — `StarsDisplay` and interactive `StarsInput`
- `src/components/review-form.js` — review form + review item card
- `src/components/question-form.js` — question form + Q&A item with answer rendering
- `src/pages/product-detail.js` — full details page

### Other
- `src/lib/dom.js` — shared `escapeHtml`, `el`, `formatDate` helpers
- Removed `src/pages/placeholder.js`

## Run it

```bash
npm run dev
```

## Verify checklist

### Home (`#/`)
1. **Hero** — large heading with brand-color name; soft gradient blobs visible top-right and bottom-left; "Now live on Supabase" status pill above the heading; two buttons (filled "Browse products" + outline "View categories").
2. **Featured products** — exactly 4 product cards in a row with a "See all →" link.
3. **Highlights** — three cards (Real-time, Brandable, Secure) with brand-tinted icon squares.

### Header
4. Logo / site name on the left, nav pills on the right; the active page's pill is filled gray.
5. On scroll, header stays sticky with a frosted-glass blur.

### Footer
6. Three columns, brand block on the left.

### Products listing (`#/products`)
7. Title "All products" + result count.
8. Filter chips with counts: `All 6`, `Apparel 2`, `Footwear 1`, `Accessories 1`, `Electronics 2`. Click any — grid filters and chip becomes brand-color filled.
9. Product cards: hover lifts shadow + scales image slightly; "View →" hint appears.

### Product detail (`#/product/<uuid>`) — **the big new page**
10. Click any product card → lands on the detail page.
11. **Hero**: large image left, info right (back link, name, star average + count, price, stock dot, description, "Add to cart" + "Keep browsing" buttons).
12. **Reviews section**: list on left, "Write a review" card on right.
    - Sample review (Alice on Tee, Bob on Hoodie) renders correctly with avatar bubble + stars.
    - **Submit a review**: enter a name, click stars (they fill in brand accent color on hover and click), optionally type comment, click "Post review". Card resets, status shows "Thanks!", new review appears at the top instantly.
13. **Q&A section**: same two-column layout.
    - On Wireless Headphones, the seeded Q&A appears with green Q + brand-color A bubbles.
    - **Submit a question**: type something, click "Ask question". Posts and appears at top with "Awaiting answer" placeholder.

### Live RLS test (proves write security works)
14. Open browser DevTools → Network. Submit a review. The POST to `…/rest/v1/reviews` should return **201 Created**.
15. Try this in Supabase SQL editor:
    ```sql
    select * from public.reviews order by created_at desc limit 5;
    ```
    Your test review should be there.
16. Reviews submitted from the public site should NOT be able to be edited/deleted by anonymous users — only admins. (We'll exercise this in the admin phase.)

### Live design-token test
17. Run in SQL Editor:
    ```sql
    update public.settings
    set primary_color = '#16a34a', accent_color = '#dc2626'
    where id = 1;
    ```
    Refresh — buttons, link colors, filter chips, heading accent → green; stars → red.
    Revert with `primary_color = '#4f46e5', accent_color = '#f59e0b'`.

---

When the 17 checks pass, reply **"phase 2c done"** and we move to Phase 3 — the admin panel (auth, product CRUD, branding editor).

## How to make a token admin-controllable later

Example — add admin control over global border radius:

1. **Add a column** to `settings`:
   ```sql
   alter table public.settings
     add column border_radius_md text default '0.625rem';
   ```
2. **Map it** in `src/services/branding.js`:
   ```js
   const TOKEN_MAP = {
     ...
     border_radius_md: '--radius-md',
   };
   ```

Done. Every `rounded-md` / `rounded` utility in the app now follows that setting. Same pattern works for shadow, container width, section padding, and any other `--*` variable.
