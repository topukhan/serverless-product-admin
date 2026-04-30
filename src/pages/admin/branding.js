import {
  getSettings,
  updateSiteIdentity,
  uploadBrandingAsset,
  setBrandingAssetUrl,
  deleteBrandingAssetByUrl,
  listThemes,
  createTheme,
  updateTheme,
  deleteTheme,
  setActiveTheme,
  setDarkTheme,
} from '../../services/admin-branding.js';
import {
  refreshBranding,
  previewTheme,
  restoreTheme,
} from '../../services/branding.js';
import { ImageUploader } from '../../components/image-uploader.js';
import { confirmDialog } from '../../components/dialog.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

// The 9 palette fields, in display order. Used by the editor.
const THEME_FIELDS = [
  { key: 'bg',              label: 'Page background' },
  { key: 'surface',         label: 'Surface (cards)' },
  { key: 'border',          label: 'Border / divider' },
  { key: 'text_color',      label: 'Body text' },
  { key: 'muted',           label: 'Muted text' },
  { key: 'primary_color',   label: 'Primary' },
  { key: 'primary_hover',   label: 'Primary (hover)' },
  { key: 'secondary_color', label: 'Secondary' },
  { key: 'accent_color',    label: 'Accent (stars)' },
];

const FONT_PRESETS = [
  { label: 'System sans-serif', value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Inter',             value: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  { label: 'Georgia (serif)',   value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono',              value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
];

export async function AdminBrandingPage() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-3xl';

  let settings;
  let themes = [];
  try {
    [settings, themes] = await Promise.all([getSettings(), listThemes()]);
  } catch (e) {
    root.innerHTML = errorBox(e.message);
    return root;
  }

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Branding & themes</h1>
      <p class="muted text-sm mt-1">
        Site identity, logo and favicon, plus a palette editor. Changes apply
        across the public site.
      </p>
    </header>

    <div data-identity></div>
    <div data-assets class="mt-8"></div>
    <div data-themes  class="mt-8"></div>
  `;

  root.querySelector('[data-identity]').appendChild(IdentitySection(settings));
  root.querySelector('[data-assets]').appendChild(AssetsSection(settings));
  root.querySelector('[data-themes]').appendChild(
    ThemesSection({
      settings,
      themes,
      onActiveChanged: (id) => { settings.active_theme_id = id; },
      onDarkChanged:   (id) => { settings.dark_theme_id   = id; },
      onThemesChanged: (next) => { themes = next; },
    })
  );

  return root;
}

/* =====================================================================
 * Section 1 — Site identity (name, font)
 * ===================================================================== */

function IdentitySection(settings) {
  const card = document.createElement('div');
  card.className = 'card p-5 sm:p-6';

  card.innerHTML = `
    <h2 class="font-semibold text-lg mb-4">Site identity</h2>
    <form data-form class="space-y-4">
      <div>
        <label class="label" for="site-name">Site name</label>
        <input id="site-name" data-name class="input" maxlength="80" required
               value="${escapeHtml(settings.site_name || '')}" />
        <p class="text-xs muted mt-1">Shown in the browser tab and the header.</p>
      </div>
      <div>
        <label class="label" for="font-family">Font</label>
        <select id="font-family" data-font class="input">
          ${FONT_PRESETS.map((f) => `
            <option value="${escapeHtml(f.value)}" ${settings.font_family === f.value ? 'selected' : ''}>
              ${escapeHtml(f.label)}
            </option>
          `).join('')}
          ${FONT_PRESETS.some((f) => f.value === settings.font_family)
            ? ''
            : `<option value="${escapeHtml(settings.font_family || '')}" selected>Custom (current)</option>`}
        </select>
      </div>
      <div class="flex justify-end">
        <button data-save type="submit" class="btn btn-primary">Save identity</button>
      </div>
    </form>
  `;

  const form = card.querySelector('[data-form]');
  const saveBtn = card.querySelector('[data-save]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const site_name = card.querySelector('[data-name]').value.trim();
    const font_family = card.querySelector('[data-font]').value;
    if (!site_name) {
      showToast('Site name is required.', { variant: 'error' });
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await updateSiteIdentity({ site_name, font_family });
      await refreshBranding();
      showToast('Identity saved', { variant: 'success' });
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save identity';
    }
  });

  return card;
}

/* =====================================================================
 * Section 2 — Logo + favicon
 * ===================================================================== */

function AssetsSection(settings) {
  const card = document.createElement('div');
  card.className = 'card p-5 sm:p-6';

  card.innerHTML = `
    <h2 class="font-semibold text-lg mb-4">Logo & favicon</h2>
    <p class="muted text-sm mb-5">
      Both go to the public <code>branding</code> bucket. Replace anytime.
      Square aspect for the favicon (32×32 or larger).
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div data-logo></div>
      <div data-favicon></div>
    </div>
  `;

  card.querySelector('[data-logo]').appendChild(
    AssetSlot({
      kind: 'logo',
      label: 'Logo',
      currentUrl: settings.logo_url,
    })
  );
  card.querySelector('[data-favicon]').appendChild(
    AssetSlot({
      kind: 'favicon',
      label: 'Favicon',
      currentUrl: settings.favicon_url,
    })
  );

  return card;
}

function AssetSlot({ kind, label, currentUrl }) {
  const wrap = document.createElement('div');
  let savedUrl = currentUrl || '';

  const uploader = ImageUploader({
    label,
    size: 'sm',
    initialUrl: savedUrl,
    upload: (file) => uploadBrandingAsset(file, kind),
    onChange: async (next) => {
      // Persist the change immediately. Saves the friction of a separate save
      // button per asset — uploads/clears feel atomic.
      try {
        await setBrandingAssetUrl(kind, next);
        // Best-effort: if we replaced our own asset, drop the old file.
        if (savedUrl && savedUrl !== next) {
          await deleteBrandingAssetByUrl(savedUrl);
        }
        savedUrl = next;
        await refreshBranding();
        showToast(next ? `${label} updated` : `${label} removed`, { variant: 'success' });
      } catch (err) {
        showToast(err.message || 'Save failed', { variant: 'error' });
      }
    },
  });
  wrap.appendChild(uploader.el);
  return wrap;
}

/* =====================================================================
 * Section 3 — Themes (switcher + editor)
 * ===================================================================== */

function ThemesSection({ settings, themes, onActiveChanged, onDarkChanged, onThemesChanged }) {
  const wrap = document.createElement('div');

  let editorState = null;        // null | { theme | null (= new) }
  let activeId = settings.active_theme_id;
  let darkId   = settings.dark_theme_id;

  wrap.innerHTML = `
    <div class="card p-5 sm:p-6">
      <div class="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div>
          <h2 class="font-semibold text-lg">Themes</h2>
          <p class="text-xs muted mt-0.5">
            Click <strong>Use this</strong> on a theme to set it as the active palette
            for its mode. The site's <em>active light</em> theme paints the public site
            by default; if a dark theme is set, visitors can flip with the header toggle.
          </p>
        </div>
        <button data-create class="btn btn-primary text-sm">+ New theme</button>
      </div>

      <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-status>
        <div data-status-light class="rounded-md p-3 text-sm flex items-center gap-3"
             style="border:1px solid var(--color-border); background: var(--color-bg)"></div>
        <div data-status-dark class="rounded-md p-3 text-sm flex items-center gap-3"
             style="border:1px solid var(--color-border); background: var(--color-bg)"></div>
      </div>

      <div class="mt-5 space-y-2">
        <div class="text-xs uppercase tracking-wider muted">☀️ Light themes</div>
        <div data-list-light class="space-y-3"></div>
      </div>
      <div class="mt-6 space-y-2">
        <div class="text-xs uppercase tracking-wider muted">🌙 Dark themes</div>
        <div data-list-dark class="space-y-3"></div>
      </div>
    </div>

    <div data-editor class="mt-6"></div>
  `;

  const lightListEl = wrap.querySelector('[data-list-light]');
  const darkListEl  = wrap.querySelector('[data-list-dark]');
  const statusLight = wrap.querySelector('[data-status-light]');
  const statusDark  = wrap.querySelector('[data-status-dark]');
  const editorEl = wrap.querySelector('[data-editor]');
  const createBtn = wrap.querySelector('[data-create]');

  function findTheme(id) { return themes.find((t) => t.id === id); }

  function rerender() {
    /* Status row at the top — at-a-glance "what's active". */
    const lt = findTheme(activeId);
    statusLight.innerHTML = `
      <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#16a34a"></span>
      <span class="flex-1">
        <span class="text-xs uppercase muted tracking-wider">Active light</span>
        <span class="block font-medium">${lt ? escapeHtml(lt.name) : 'None — pick one below'}</span>
      </span>
    `;
    const dt = findTheme(darkId);
    statusDark.innerHTML = dt ? `
      <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#1d4ed8"></span>
      <span class="flex-1">
        <span class="text-xs uppercase muted tracking-wider">Active dark</span>
        <span class="block font-medium">${escapeHtml(dt.name)}</span>
      </span>
      <button data-disable-dark class="text-xs hover:underline" style="color:#b91c1c">Disable</button>
    ` : `
      <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:var(--color-border)"></span>
      <span class="flex-1">
        <span class="text-xs uppercase muted tracking-wider">Dark mode</span>
        <span class="block font-medium muted">Disabled — visitors won't see the toggle</span>
      </span>
    `;

    const disableBtn = statusDark.querySelector('[data-disable-dark]');
    if (disableBtn) {
      disableBtn.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Disable dark mode?',
          message: 'The header toggle on the public site will disappear. You can re-enable any time by activating a dark theme below.',
          confirmText: 'Disable',
          variant: 'danger',
        });
        if (!ok) return;
        await applyDark(null);
      });
    }

    /* Two grouped lists. */
    const lights = themes.filter((t) => (t.mode || 'light') === 'light');
    const darks  = themes.filter((t) => (t.mode || 'light') === 'dark');

    lightListEl.replaceChildren(...(lights.length
      ? lights.map((t) => themeRow(t))
      : [emptySlot('No light themes yet — create one above.')]));
    darkListEl.replaceChildren(...(darks.length
      ? darks.map((t) => themeRow(t))
      : [emptySlot('No dark themes yet. Create one (set Mode to Dark) to enable the dark toggle on the public site.')]));

    editorEl.replaceChildren();
    if (editorState) {
      editorEl.appendChild(themeEditor(editorState));
    }
  }

  function emptySlot(msg) {
    const div = document.createElement('div');
    div.className = 'rounded-md p-4 text-sm muted text-center';
    div.style.border = '1px dashed var(--color-border)';
    div.textContent = msg;
    return div;
  }

  async function applyLight(id) {
    try {
      await setActiveTheme(id);
      activeId = id;
      onActiveChanged(id);
      await refreshBranding();
      showToast('Light theme activated', { variant: 'success' });
      rerender();
    } catch (err) {
      showToast(err.message || 'Failed to activate', { variant: 'error' });
    }
  }
  async function applyDark(id) {
    try {
      await setDarkTheme(id);
      darkId = id;
      onDarkChanged(id);
      await refreshBranding();
      showToast(id ? 'Dark theme activated' : 'Dark mode disabled', { variant: 'success' });
      rerender();
    } catch (err) {
      showToast(err.message || 'Failed to update', { variant: 'error' });
    }
  }

  function themeRow(theme) {
    const mode = theme.mode || 'light';
    const isActive = mode === 'light' ? theme.id === activeId : theme.id === darkId;
    const row = document.createElement('div');
    row.className = 'card p-4 flex items-center gap-4';
    if (isActive) {
      row.style.borderColor = mode === 'light' ? '#16a34a' : '#1d4ed8';
      row.style.background = mode === 'light' ? '#f0fdf4' : 'rgba(29, 78, 216, 0.05)';
    }

    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium">${escapeHtml(theme.name)}</span>
          ${isActive
            ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                     style="background:${mode === 'light' ? '#dcfce7' : '#dbeafe'};
                            color:${mode === 'light' ? '#166534' : '#1e40af'}">
                 ✓ Active ${mode}
               </span>`
            : ''}
        </div>
        <div class="flex gap-1 mt-2">
          ${THEME_FIELDS.map((f) => `
            <span class="inline-block w-5 h-5 rounded"
                  title="${escapeHtml(f.label)}: ${escapeHtml(theme[f.key] || '')}"
                  style="background: ${escapeHtml(theme[f.key] || '#ccc')};
                         border: 1px solid var(--color-border)"></span>
          `).join('')}
        </div>
      </div>
      <div class="flex gap-2 shrink-0">
        ${isActive
          ? ''
          : `<button data-use class="btn btn-primary text-xs">Use this</button>`}
        <button data-edit class="btn btn-ghost text-xs">Edit</button>
        <button data-delete class="btn btn-ghost text-xs" style="color:#b91c1c">Delete</button>
      </div>
    `;

    const useBtn = row.querySelector('[data-use]');
    if (useBtn) {
      useBtn.addEventListener('click', () => {
        if (mode === 'light') applyLight(theme.id);
        else applyDark(theme.id);
      });
    }

    row.querySelector('[data-edit]').addEventListener('click', () => {
      editorState = { theme };
      rerender();
      editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    row.querySelector('[data-delete]').addEventListener('click', async () => {
      if (theme.id === activeId || theme.id === darkId) {
        showToast('Activate a different theme for this slot before deleting.', { variant: 'error' });
        return;
      }
      const ok = await confirmDialog({
        title: `Delete "${theme.name}"?`,
        message: 'This palette will be gone. Existing pages already paint from CSS variables, so the live site will keep its current look until you switch.',
        confirmText: 'Delete theme',
        variant: 'danger',
      });
      if (!ok) return;
      try {
        await deleteTheme(theme.id);
        themes = themes.filter((t) => t.id !== theme.id);
        onThemesChanged(themes);
        showToast('Theme deleted', { variant: 'success' });
        rerender();
      } catch (err) {
        showToast(err.message || 'Delete failed', { variant: 'error' });
      }
    });

    return row;
  }

  function themeEditor(state) {
    const isNew = !state.theme;
    const seed = state.theme || blankThemeFromActive();

    const card = document.createElement('div');
    card.className = 'card p-5 sm:p-6';
    card.style.borderColor = 'var(--color-primary)';

    card.innerHTML = `
      <div class="flex items-center justify-between mb-4 gap-3">
        <h3 class="font-semibold text-lg">${isNew ? 'New theme' : `Edit "${escapeHtml(seed.name)}"`}</h3>
        <button data-cancel type="button" class="btn btn-ghost text-xs">Cancel</button>
      </div>

      <form data-form class="space-y-5">
        <div class="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label class="label" for="theme-name">Name</label>
            <input id="theme-name" data-name class="input" maxlength="40" required
                   value="${escapeHtml(seed.name || '')}" />
          </div>
          <div>
            <span class="label">Mode</span>
            <div class="flex" data-mode-group>
              <button type="button" data-mode="light"
                      class="text-xs px-3 py-2 rounded-l-md transition border-r-0"
                      style="border:1px solid var(--color-border); background:var(--color-surface)">
                ☀️ Light
              </button>
              <button type="button" data-mode="dark"
                      class="text-xs px-3 py-2 rounded-r-md transition"
                      style="border:1px solid var(--color-border); background:var(--color-surface)">
                🌙 Dark
              </button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${THEME_FIELDS.map((f) => `
            <label class="flex items-center gap-3 p-2 rounded-md"
                   style="border:1px solid var(--color-border)">
              <input type="color" data-field="${f.key}"
                     value="${escapeHtml(seed[f.key] || '#000000')}"
                     class="w-10 h-10 rounded cursor-pointer shrink-0"
                     style="border:1px solid var(--color-border); background:transparent" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium">${escapeHtml(f.label)}</div>
                <input type="text" data-hex="${f.key}" maxlength="9"
                       value="${escapeHtml(seed[f.key] || '#000000')}"
                       class="input mt-1 text-xs font-mono" />
              </div>
            </label>
          `).join('')}
        </div>

        <p class="text-xs muted">
          Preview applies as you tweak. Press <strong>Save</strong> to persist.
          <strong>Cancel</strong> reverts the live preview.
        </p>

        <div class="flex justify-end gap-2">
          <button data-cancel2 type="button" class="btn btn-ghost">Cancel</button>
          <button data-save type="submit" class="btn btn-primary">
            ${isNew ? 'Create theme' : 'Save changes'}
          </button>
        </div>
      </form>
    `;

    // Wire color + hex pairs to live-preview.
    const draft = { ...seed };
    if (!draft.mode) draft.mode = 'light';
    function applyPreview() {
      previewTheme(draft);
    }

    /* Mode toggle. */
    function paintModeButtons() {
      card.querySelectorAll('[data-mode]').forEach((btn) => {
        const active = btn.dataset.mode === draft.mode;
        btn.style.background = active ? 'var(--color-primary)' : 'var(--color-surface)';
        btn.style.color = active ? '#fff' : 'var(--color-text)';
        btn.style.borderColor = active ? 'var(--color-primary)' : 'var(--color-border)';
      });
    }
    paintModeButtons();
    card.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        draft.mode = btn.dataset.mode;
        paintModeButtons();
      });
    });

    THEME_FIELDS.forEach((f) => {
      const colorInput = card.querySelector(`[data-field="${f.key}"]`);
      const hexInput = card.querySelector(`[data-hex="${f.key}"]`);
      colorInput.addEventListener('input', () => {
        draft[f.key] = colorInput.value;
        hexInput.value = colorInput.value;
        applyPreview();
      });
      hexInput.addEventListener('input', () => {
        const v = hexInput.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(v)) {
          draft[f.key] = v;
          colorInput.value = v;
          applyPreview();
        }
      });
    });

    function close() {
      editorState = null;
      restoreTheme();
      rerender();
    }
    card.querySelector('[data-cancel]').addEventListener('click', close);
    card.querySelector('[data-cancel2]').addEventListener('click', close);

    card.querySelector('[data-form]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = card.querySelector('[data-name]').value.trim();
      if (!name) {
        showToast('Theme name is required.', { variant: 'error' });
        return;
      }
      // Validate hex inputs before submit.
      for (const f of THEME_FIELDS) {
        if (!/^#[0-9a-f]{6}$/i.test(draft[f.key] || '')) {
          showToast(`"${f.label}" must be a 6-digit hex color.`, { variant: 'error' });
          return;
        }
      }
      const payload = { name, mode: draft.mode || 'light', ...Object.fromEntries(THEME_FIELDS.map((f) => [f.key, draft[f.key]])) };

      const saveBtn = card.querySelector('[data-save]');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        let saved;
        if (isNew) {
          saved = await createTheme(payload);
          themes = [...themes, saved];
        } else {
          saved = await updateTheme(seed.id, payload);
          themes = themes.map((t) => (t.id === saved.id ? saved : t));
        }
        onThemesChanged(themes);
        // If we edited the live theme, refresh from DB so cache matches.
        if (saved.id === activeId) await refreshBranding();
        showToast(isNew ? 'Theme created' : 'Theme saved', { variant: 'success' });
        editorState = null;
        rerender();
      } catch (err) {
        showToast(err.message || 'Save failed', { variant: 'error' });
        saveBtn.disabled = false;
        saveBtn.textContent = isNew ? 'Create theme' : 'Save changes';
      }
    });

    // Apply initial preview so the editor reflects the draft from the start.
    applyPreview();
    return card;
  }

  function blankThemeFromActive() {
    const active = themes.find((t) => t.id === activeId) || themes[0] || {};
    return {
      name: '',
      bg: active.bg || '#f7f3ed',
      surface: active.surface || '#ffffff',
      border: active.border || '#e8e1d4',
      text_color: active.text_color || '#1f1c18',
      muted: active.muted || '#6b6358',
      primary_color: active.primary_color || '#5a6b4a',
      primary_hover: active.primary_hover || '#4a5a3c',
      secondary_color: active.secondary_color || '#a89580',
      accent_color: active.accent_color || '#c8956d',
    };
  }

  createBtn.addEventListener('click', () => {
    editorState = { theme: null };
    rerender();
    editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  rerender();
  return wrap;
}

/* ===================================================================== */

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      Failed to load branding: ${escapeHtml(msg)}
    </div>`;
}
