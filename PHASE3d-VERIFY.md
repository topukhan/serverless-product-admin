# Phase 3d — Verify (reviews + Q&A moderation)

No schema changes. The existing `reviews` and `questions` tables already have admin-only update/delete via RLS. This phase swaps the placeholder pages for real ones.

## What's new

### Services
- `src/services/admin-reviews.js` — `getAdminReviews()` (joins `products(id,name)`), `deleteReview(id)`
- `src/services/admin-questions.js` — `getAdminQuestions()` (joins product), `answerQuestion(id, answer)` (empty input clears back to null), `deleteQuestion(id)`

### Pages
- `src/pages/admin/reviews.js` — list newest-first, search, rating filter chips (All/5★/4★/3★/2★/1★), avatar bubble, product link, delete
- `src/pages/admin/questions.js` — list newest-first, search, "Unanswered only" toggle, **inline answer editor** (Cmd/Ctrl+Enter saves, Escape cancels, blank-save clears the answer)
- `/admin/reviews` and `/admin/questions` routes now use real pages

## Run it

```bash
npm run dev
```

Sign in as admin.

## Verify checklist

### Reviews list (`#/admin/reviews`)
1. The "Reviews" sidebar item is highlighted.
2. The seeded reviews appear newest-first. Each card shows avatar bubble (initial), name, product link, date, full star rating, and the comment body.
3. Header summary reads `2 reviews` (or however many you have).

### Reviews search + filter
4. Type `tee` in the search → only the Classic Tee review remains. Header reads "1 of 2 matching".
5. Clear search → both reappear.
6. Click the **5★** chip → only 5-star reviews. Click **All** to reset.
7. Combined: search + rating filter both apply (e.g., search "alice" + 5★).
8. Filtering to a state with no matches shows the dashed empty card with a "No matches" title.

### Public page → admin parity
9. Open `#/products/<some product>` and submit a new review (we still have review-limit headroom). Refresh `#/admin/reviews` — the new review appears at the top with today's date.

### Delete review
10. Click **Delete** on any review → polished danger dialog: "From "{name}" on {product}. This can't be undone."
11. Cancel → still in list.
12. Confirm → toast "Review deleted", row vanishes, count decrements.
13. **Public verification** — visit the affected product's detail page. The deleted review is gone from the public reviews section. The star average + count update.

### Questions list (`#/admin/questions`)
14. Sidebar item "Questions" highlights. The seeded Q on Wireless Headphones is shown with its answer rendered (Q + A bubbles).
15. Header reads e.g. `1 question · all answered`.

### Submit a public question, then answer it
16. On the public detail page for any product, ask a question (use the Q&A form on the right column). Refresh `#/admin/questions` — your new question appears at the top with an amber **Awaiting answer** badge.
17. Header summary updates to `2 questions · 1 unanswered`.
18. Tick the **Unanswered only** checkbox → only the unanswered question is shown.
19. Untick it → both reappear.

### Inline answer flow
20. Click **Answer** on the unanswered question → the card swaps to a textarea with a "Your answer" label, focused with cursor at end.
21. Type a short answer → click **Save answer**. Toast "Answer saved", the card returns to view mode showing your answer in an A bubble. Awaiting badge disappears. Header drops "1 unanswered" → "all answered".
22. Click **Edit answer** on that same question → textarea appears pre-filled with what you wrote. Make a change → press **Cmd/Ctrl + Enter** (keyboard shortcut) → saves. (Plain Enter inserts a newline.)
23. Click **Edit answer** again, clear the textarea entirely, click Save → toast "Answer cleared", awaiting badge returns. Row shows the unanswered state.
24. Click **Edit answer** → press **Escape** → exits edit mode without saving.

### Public page → answer parity
25. Open the public detail page for that product → in the Q&A list on the right, your answered question now shows the A bubble (or shows "Awaiting answer" if you cleared it).

### Delete question
26. Click **Delete** on a question → danger dialog: "On {product}. The customer's question{ and your answer if any} will be permanently removed."
27. Confirm → toast "Question deleted", row vanishes.
28. Public detail page no longer lists that question.

### Edge: deleted product reference
This is hard to trigger without doing a destructive product delete, but the code handles it:
29. (Optional) Edit a question row's product reference manually in SQL to a non-existent UUID → the admin page shows *"deleted product"* in italic where the product link would be, and skips the link target. (You can safely skip this check.)

### Search & filter on questions
30. In the search box, type a substring of the question text → only matching cards remain.
31. Search by product name (e.g. "Headphones") → matches questions on that product.
32. Combined with **Unanswered only** → both filters apply.

---

When the 32 checks pass, reply **"phase 3d done"** and I'll build **Phase 3e: Branding & themes editor** (site identity + logo/favicon upload + theme switcher + per-theme palette editor).
