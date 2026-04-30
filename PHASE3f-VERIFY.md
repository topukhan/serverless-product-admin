# Phase 3f — Verify (Order management)

This phase covers checkout, invoice, customer order tracking, admin orders
management, status workflow + stock deltas, and the rebuilt dashboard.

## Step 1 — Apply the migration

Push the new migration to Supabase:

```bash
npx supabase db push
```

This adds:
- Tables: `orders`, `order_items`, `order_events`
- Columns on `settings`: `order_rate_limit_count`, `order_rate_limit_minutes`, `default_delivery_charge`
- Sequence `order_number_seq` + helper `next_order_number()`
- RPCs: `place_order`, `get_order_view`, `find_order_lookup`, `update_order_status`, `update_order_charges`, `get_dashboard_stats`, `get_pending_order_count`

**Verify in Table Editor:**
- 3 new tables exist
- `settings` row has `order_rate_limit_count = 5`, `order_rate_limit_minutes = 15`, `default_delivery_charge = 0`
- `pg_sequences` shows `order_number_seq` starting at 1000

## Step 2 — Run dev server

```bash
npm run dev
```

---

## Customer flow

### Cart → Checkout
1. Add 2 products to cart. Open `#/cart`.
2. The "Checkout (coming soon)" button is now an active **Checkout** button
   that links to `#/checkout`.
3. Checkout page shows the line items, subtotal, delivery charge (= site
   setting, default 0), and total.

### Validation
4. Click **Place order** with empty fields → inline errors under name, phone,
   address; no network call fired.
5. Type `a` in name → "Please enter your full name." error stays.
6. Type a 4-digit phone → "Please enter a valid phone number." error.
7. Fill all 3 fields validly, place order → redirected to
   `#/order/ORD-001000?fresh=1` (number increments per order; first one starts
   at 1000).

### Thank-you popup
8. The popup appears showing the order number + two buttons: **View invoice**
   and **Download**.
9. **View invoice** dismisses the popup; the URL strips `?fresh=1` so a refresh
   doesn't re-show it.
10. **Download** dismisses the popup, then opens the print dialog. Save as
    PDF — the rendered output is invoice-only (no header/footer/buttons).

### Invoice page
11. The order page shows: brand name, order number, date, customer info,
    status pill (`Pending`), table of items, subtotal/charge/total breakdown,
    status history timeline.
12. Click **Download invoice** in the page header — same print flow.
13. Open `#/order/ORD-001000` directly (no `?fresh=1`) → no popup, full
    invoice still renders.

### Track order
14. Open `#/track-order`. Type `ORD-001000` → submit → redirects to the order
    page.
15. Type a bogus value like `nope` → "No order matched that ID." inline error.
16. The header now has a **Track** link visible from any public page.

### Rate limit
17. In the Site Settings page (admin), set `Max orders per phone = 2` and
    `Within = 5` minutes. Save.
18. Place 2 more orders with the **same** phone number from checkout. The 3rd
    attempt within the window shows a toast: "You've placed too many orders
    recently. Please wait a few minutes and try again."
19. Use a different phone → succeeds (rate limit is per phone).

---

## Admin flow

### Pending badge on the nav
20. Sign in at `#/admin/login`. The Orders item in the sidebar shows a small
    red badge with the pending count.

### Orders list
21. Open `#/admin/orders`. Filters card: date range presets, status pills with
    counts, search box.
22. Click the **Pending** pill → list filters to pending only; the active
    pill turns primary. Click **All** to clear.
23. Type the customer's phone in search → list filters within ~280ms.

### Order detail — approve flow
24. Click an order → detail page shows customer card (with **Call** /
    **WhatsApp** links for the phone), items, totals card with editable
    Discount + Charge inputs (visible while pending), and the Actions sidebar.
25. Edit Charge to `60` → save → toast "Charges updated", Total updates,
    timeline gets an event "Charges updated (...)".
26. Click **Approve → Approved**. Confirm dialog says "Stock will be deducted
    now." → Approve.
27. Toast "Status → approved". The status pill flips to Approved. Open the
    products page in a separate tab — stock for each ordered product dropped
    by the order quantity.

### Approve failure when stock insufficient
28. Set a product's stock to 0 in admin. Place a fresh order for that product
    (you'll need to bypass cart — for verification, manually approve a
    pending order whose stock has since gone to 0). The Approve button
    should now toast: "Cannot approve — one of the items has insufficient
    stock." and the order stays pending.

### Cancel from approved → stock restored
29. Approve another fresh order. Note product's current stock.
30. On the detail page, click **Cancel → Cancelled** → confirms with "Stock
    will be returned to inventory." → Cancel order.
31. Refresh the products list — stock returned to its pre-approve value.

### Cancel from pending → no stock change
32. Place a new order, leave it pending. Click **Cancel → Cancelled** →
    different message ("The order will be marked cancelled."). Confirm.
33. Stock unchanged (since pending hadn't deducted yet).

### Ship → tracking ID prompt
34. Approve another order. Click **Ship → Shipped** → a modal pops up asking
    for tracking ID.
35. Submit empty → inline "Tracking ID is required" error; no transition.
36. Type `RX-12345` → Ship. Toast "Status → shipped"; tracking ID shows in
    the actions sidebar and on the customer's invoice page.
37. Open `#/track-order` (public) → enter `RX-12345` → redirects to the same
    order. Tracking ID and order number both work as lookup keys.

### Deliver
38. Click **Mark delivered → Delivered** → confirms → status flips to
    delivered. No stock change.

### Returned
39. From a delivered order, click **Mark returned → Returned**. Stock is
    restored (since the order had been approved earlier).

### Cancel restrictions
40. On a shipped/delivered/cancelled/returned order, the actions sidebar
    shows only the legal next steps (no "Cancel" option after shipped).
41. Cancelled / Returned orders show "This order is in a final state."

### Customer view stays in sync
42. While admin changes status, switch to the customer's invoice tab and
    refresh. The status pill, tracking ID, and timeline reflect the latest
    admin actions.

---

## Dashboard

### Stat cards
43. Open `#/admin`. The header card shows a date range picker (default:
    Last 30 days). Below that:
    - 3 large cards: **Approved orders**, **Delivered orders**,
      **Cancelled orders** (each shows total amount + count)
    - 3 smaller tiles: **Pending**, **Shipped**, **Returned** (count only)
44. Click the **Approved orders** card → navigates to
    `#/admin/orders?from=...&to=...&status=approved` with that filter
    pre-applied. The status pill `Approved` is selected and the date range
    matches.
45. Switch the dashboard date range to **Today** → all card numbers
    re-fetch.
46. Switch to **Custom** → pick two dates → cards reload with the chosen
    window.

### Catalog tile
47. The bottom-right card shows quick counts for Products, Categories,
    Reviews, Questions. Click any → navigates to that admin page.

---

## Site settings

### Order policy form
48. Open `#/admin/site-settings`. Below the existing flag toggles, an
    **Order policy** card has 3 inputs: Max orders, Within (minutes),
    Default delivery charge.
49. Change Default delivery charge to `60` → Save. Toast "Order policy saved".
50. Open `#/checkout` (with cart items) → the order summary now shows
    Delivery `৳60` and the Total reflects it.

---

## RLS sanity checks

### As anon
51. Sign out. In the browser console:
    ```js
    const { data, error } = await window.supabase
      ?.from('orders')?.select('*');
    ```
    (Or simulate with the supabase client.) `data` should be empty / `error`
    should indicate no permission to list orders directly.
52. The `place_order`, `get_order_view`, `find_order_lookup` RPCs are still
    callable (anon-granted).

### As admin
53. Sign in. Direct table access works, plus the admin-only RPCs.

---

## Build check
```bash
npm run build
```
Should complete with no errors.

---

When all 53 checks pass, reply **"phase 3f done"** and we'll move on. Likely
candidates for next phase: bKash/Nagad payments, customer "my orders"
saved-locally list with deep-link badges, CSV export, or notification
emails.
