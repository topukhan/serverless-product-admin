# Phase 3e — Verify (Branding & themes editor)

## What's new

### New service
- `src/services/admin-branding.js` — admin-only writes for `settings` and `themes`:
  - `getSettings`, `updateSiteIdentity({ site_name, font_family })`
  - `uploadBrandingAsset(file, kind)`, `setBrandingAssetUrl(kind, url)`,
    `deleteBrandingAssetByUrl(url)` (kind = `'logo' | 'favicon'`)
  - `listThemes`, `createTheme`, `updateTheme`, `deleteTheme`, `setActiveTheme`

### Branding service additions
- `src/services/branding.js` gains:
  - `refreshBranding()` — re-fetches the row + active theme and re-applies CSS
    vars / favicon / `<title>`. Used after every save so the change is live
    immediately, no page reload.
  - `previewTheme(theme)` — applies a draft palette (in-memory) for live preview
    while editing.
  - `restoreTheme()` — reverts to the saved active theme (used by the editor's
    Cancel button).

### Reusable image uploader
- `src/components/image-uploader.js` now accepts:
  - `upload` — custom upload function (defaults to product images)
  - `onChange(url)` — fires when the value changes (upload, paste, or clear)
- Existing product usage is unchanged.

### Admin page
- `src/pages/admin/branding.js` — three sections:
  1. **Site identity** — site name + font (preset list + a "Custom (current)"
     fallback option for whatever is in the DB if it's not in the preset list)
  2. **Logo & favicon** — two image slots that upload to the public `branding`
     bucket and persist instantly. Replacing an asset deletes the previous file
     when it lived in our bucket (best-effort).
  3. **Themes** — list with active radio + 9-swatch preview row; Edit / Delete
     per theme; **+ New theme** button. Editor card slides in below with a
     `<input type="color">` + matching hex text input for each of the 9 fields.
     Live preview as you tweak; Cancel reverts to the saved active theme.

### Route
- `src/main.js` swaps the coming-soon placeholder for the real page at
  `#/admin/branding`.

## Step 1 — Run dev server

No DB migration required (the `themes` table + `branding` bucket already exist).

```bash
npm run dev
```

Sign in at `#/admin/login` if you aren't already.

## Verify checklist

### Site identity
1. Open `#/admin/branding`. The Site identity card shows the current site name
   and the font selector with the active option selected.
2. Change the site name to something distinctive (e.g. `Topu's Demo`) → click
   **Save identity**. Toast "Identity saved".
3. Browser tab title updates to the new name immediately (no reload).
4. Open `#/` in a new tab — header shows the new name (because public pages
   call `loadBranding()` on boot, which now returns the saved value).

### Font
5. Switch the Font dropdown to **Georgia (serif)** → Save. Body text on the
   admin page changes to a serif face right away.
6. Switch back to **System sans-serif** → Save. Sans returns.

### Logo & favicon
7. Logo slot — click **Click to upload**, pick any PNG/JPG/WebP. Toast
   "Logo updated". Preview thumbnail appears in the slot.
8. The site title in the header (or wherever you render `brand.logo_url`)
   reflects the new logo on next render — verify on `#/` that the URL is set
   on the settings row in DB even if you don't render the logo yet.
9. Click **Replace** on the logo → upload a different file. Toast updates.
   The previous file is removed from the `branding` bucket (verify in
   Supabase Storage UI — only the latest object remains).
10. Click **Remove** → toast "Logo removed", slot returns to dropzone.
11. Repeat 7–10 for the **Favicon** slot. After upload, the browser tab icon
    changes immediately (the `<link id="favicon">` href is patched live).
12. Paste an external URL into the **…or paste an image URL** field of either
    slot → it persists and applies. Removing it does NOT try to delete an
    external URL from storage (no error toast).

### Themes — switcher
13. The Themes section lists all rows from the `themes` table (default seed:
    Sand, Slate, Forest). The active one has a primary-colored border + ring
    and its radio is checked.
14. Click the radio for **Slate** → page repaints to the Slate palette
    immediately, toast "Activated 'Slate'", and the row now shows the active
    border. Reload the page → still Slate (persisted to `settings`).
15. Switch back to Sand.

### Themes — editor (edit existing)
16. Click **Edit** on Sand. Editor card opens below with a name field and 9
    color pickers, each with a hex text input next to it.
17. Drag the **Primary** color picker — the page repaints in real time
    (buttons, links, focus rings shift hue).
18. Type a different hex into the **Accent (stars)** text input
    (e.g. `#aa00ff`). The matching color picker swatch updates and stars on
    other admin pages would now render purple if visible.
19. Click **Cancel** at the bottom (or the X-style cancel at the top). The
    page snaps back to the saved Sand palette. The row list re-renders.
20. Edit Sand again → tweak the Primary color → click **Save changes**. Toast
    "Theme saved". Editor closes. Page stays on the new color (because Sand is
    active and we re-fetch).

### Themes — create custom
21. Click **+ New theme**. Editor opens pre-seeded with the active palette
    and an empty name field. Live preview applies as you tweak.
22. Set a wild palette (e.g. dark text on cream, hot-pink primary) and name
    it `Demo`. Click **Create theme**. Toast "Theme created". The new row
    appears at the bottom of the list with its 9-swatch preview.
23. Activate Demo via its radio → page repaints to the new palette.
24. Switch back to Sand.

### Themes — delete
25. Try to **Delete** the currently active theme. Toast: "Activate another
    theme before deleting this one." (We block this to avoid orphaning the
    `settings.active_theme_id` mid-render.)
26. Activate a different theme, then **Delete** the Demo theme. Confirm the
    danger dialog. Toast "Theme deleted". Row disappears.

### Hex validation
27. In the editor, paste a malformed hex like `#abc` into one of the hex
    text inputs and click **Save**. Error toast: "<field> must be a 6-digit
    hex color." Save is blocked, draft preview is left as-is.

### Public site
28. Open `#/` and `#/products` in another tab. The active palette + identity
    + favicon all match the admin's last save.

### RLS sanity
29. Sign out → try to fetch themes via the supabase client in the console:
    a public read should work (so visitors can theoretically read palettes),
    but `update`/`insert`/`delete` should fail. Same for `settings` (read OK,
    write blocked).
30. Sign back in as admin → admin reads/writes succeed.

---

When all 30 checks pass, reply **"phase 3e done"** and I'll move on to
**Phase 3f**.
