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

// The 9 palette slots a theme owns — used to build the editor UI for both
// the light side and the dark side. The DB stores these as e.g. light_bg,
// dark_bg, etc.
const PALETTE_SLOTS = [
  { key: 'bg',            label: 'Page background' },
  { key: 'surface',       label: 'Surface (cards)' },
  { key: 'border',        label: 'Border / divider' },
  { key: 'text',          label: 'Body text' },
  { key: 'muted',         label: 'Muted text' },
  { key: 'primary',       label: 'Primary' },
  { key: 'primary_hover', label: 'Primary (hover)' },
  { key: 'secondary',     label: 'Secondary' },
  { key: 'accent',        label: 'Accent (stars)' },
];

// Sensible bootstrap palettes for a brand-new theme.
const NEW_LIGHT = {
  bg: '#f7f3ed', surface: '#ffffff', border: '#e8e1d4',
  text: '#1f1c18', muted: '#6b6358',
  primary: '#5a6b4a', primary_hover: '#4a5a3c',
  secondary: '#a89580', accent: '#c8956d',
};
const NEW_DARK = {
  bg: '#0f1115', surface: '#1a1d23', border: '#2a2e36',
  text: '#e8e6e1', muted: '#9aa0a8',
  primary: '#9bb886', primary_hover: '#a8c690',
  secondary: '#7a8a6e', accent: '#d4a373',
};

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

function ThemesSection({ settings, themes, onActiveChanged, onThemesChanged }) {
  const wrap = document.createElement('div');

  let editorState = null;        // null | { theme | null (= new) }
  let activeId = settings.active_theme_id;

  wrap.innerHTML = `
    <div class="card p-5 sm:p-6">
      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 class="font-semibold text-lg">Themes</h2>
          <p class="text-xs muted mt-0.5">Pick the active palette, or build a custom one.</p>
        </div>
        <button data-create class="btn btn-primary text-sm">+ New theme</button>
      </div>
      <div data-list class="space-y-3"></div>
    </div>

    <div data-editor class="mt-6"></div>
  `;

  const listEl = wrap.querySelector('[data-list]');
  const editorEl = wrap.querySelector('[data-editor]');
  const createBtn = wrap.querySelector('[data-create]');

  function rerender() {
    listEl.replaceChildren(...themes.map((t) => themeRow(t)));
    editorEl.replaceChildren();
    if (editorState) {
      editorEl.appendChild(themeEditor(editorState));
    }
  }

  function themeRow(theme) {
    const isActive = theme.id === activeId;
    const row = document.createElement('div');
    row.className = 'card p-4 flex items-center gap-4';
    if (isActive) {
      row.style.borderColor = 'var(--color-primary)';
      row.style.boxShadow = 'var(--ring-focus)';
    }

    row.innerHTML = `
      <input type="radio" name="active-theme" data-active
             class="shrink-0" ${isActive ? 'checked' : ''} />
      <div class="flex-1 min-w-0">
        <div class="font-medium">${escapeHtml(theme.name)}</div>
        <div class="flex flex-wrap gap-3 mt-2 text-[10px] muted">
          <div class="flex items-center gap-1">
            <span class="font-medium">Light</span>
            ${PALETTE_SLOTS.map((f) => `
              <span class="inline-block w-4 h-4 rounded"
                    title="${escapeHtml(f.label)}"
                    style="background: ${escapeHtml(theme[`light_${f.key}`] || '#ccc')};
                           border: 1px solid var(--color-border)"></span>
            `).join('')}
          </div>
          <div class="flex items-center gap-1">
            <span class="font-medium">Dark</span>
            ${PALETTE_SLOTS.map((f) => `
              <span class="inline-block w-4 h-4 rounded"
                    title="${escapeHtml(f.label)}"
                    style="background: ${escapeHtml(theme[`dark_${f.key}`] || '#222')};
                           border: 1px solid var(--color-border)"></span>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="flex gap-2 shrink-0">
        <button data-edit class="btn btn-ghost text-xs">Edit</button>
        <button data-delete class="btn btn-ghost text-xs" style="color:#b91c1c">Delete</button>
      </div>
    `;

    row.querySelector('[data-active]').addEventListener('change', async (e) => {
      if (!e.target.checked) return;
      try {
        await setActiveTheme(theme.id);
        activeId = theme.id;
        onActiveChanged(theme.id);
        await refreshBranding();
        showToast(`Activated "${theme.name}"`, { variant: 'success' });
        rerender();
      } catch (err) {
        showToast(err.message || 'Could not activate', { variant: 'error' });
        rerender();
      }
    });

    row.querySelector('[data-edit]').addEventListener('click', () => {
      editorState = { theme };
      rerender();
      editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    row.querySelector('[data-delete]').addEventListener('click', async () => {
      if (theme.id === activeId) {
        showToast('Activate another theme before deleting this one.', { variant: 'error' });
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
    const seed = state.theme || blankTheme();

    const card = document.createElement('div');
    card.className = 'card p-5 sm:p-6';
    card.style.borderColor = 'var(--color-primary)';

    card.innerHTML = `
      <div class="flex items-center justify-between mb-4 gap-3">
        <h3 class="font-semibold text-lg">${isNew ? 'New theme' : `Edit "${escapeHtml(seed.name)}"`}</h3>
        <button data-cancel type="button" class="btn btn-ghost text-xs">Cancel</button>
      </div>

      <form data-form class="space-y-5">
        <div>
          <label class="label" for="theme-name">Name</label>
          <input id="theme-name" data-name class="input" maxlength="40" required
                 value="${escapeHtml(seed.name || '')}" />
        </div>

        <p class="text-xs muted">
          Each theme owns both palettes — visitors flip between them with the
          header sun/moon toggle. Tweaking a side previews live in that mode.
          Use <strong>Copy ← / →</strong> to bootstrap one side from the other.
        </p>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          ${paletteColumn('light', '☀️ Light mode', seed)}
          ${paletteColumn('dark',  '🌙 Dark mode',  seed)}
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t" style="border-color:var(--color-border)">
          <button data-cancel2 type="button" class="btn btn-ghost">Cancel</button>
          <button data-save type="submit" class="btn btn-primary">
            ${isNew ? 'Create theme' : 'Save changes'}
          </button>
        </div>
      </form>
    `;

    // Working copy: { name, light_*: hex, dark_*: hex }
    const draft = { name: seed.name || '' };
    for (const slot of PALETTE_SLOTS) {
      draft[`light_${slot.key}`] = seed[`light_${slot.key}`] || NEW_LIGHT[slot.key];
      draft[`dark_${slot.key}`]  = seed[`dark_${slot.key}`]  || NEW_DARK[slot.key];
    }

    function applyPreview() {
      previewTheme(draft);
    }

    /* Wire color + hex pairs for both palettes. */
    ['light', 'dark'].forEach((mode) => {
      PALETTE_SLOTS.forEach((slot) => {
        const fullKey = `${mode}_${slot.key}`;
        const colorInput = card.querySelector(`[data-field="${fullKey}"]`);
        const hexInput   = card.querySelector(`[data-hex="${fullKey}"]`);
        colorInput.addEventListener('input', () => {
          draft[fullKey] = colorInput.value;
          hexInput.value = colorInput.value;
          applyPreview();
        });
        hexInput.addEventListener('input', () => {
          const v = hexInput.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) {
            draft[fullKey] = v;
            colorInput.value = v;
            applyPreview();
          }
        });
      });
    });

    /* Copy palette from one side to the other. */
    card.querySelectorAll('[data-copy-from]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fromMode = btn.dataset.copyFrom;
        const toMode = fromMode === 'light' ? 'dark' : 'light';
        PALETTE_SLOTS.forEach((slot) => {
          const v = draft[`${fromMode}_${slot.key}`];
          draft[`${toMode}_${slot.key}`] = v;
          card.querySelector(`[data-field="${toMode}_${slot.key}"]`).value = v;
          card.querySelector(`[data-hex="${toMode}_${slot.key}"]`).value = v;
        });
        applyPreview();
        showToast(`Copied ${fromMode} → ${toMode}`, { variant: 'success' });
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
      // Validate every hex.
      for (const mode of ['light', 'dark']) {
        for (const slot of PALETTE_SLOTS) {
          const v = draft[`${mode}_${slot.key}`] || '';
          if (!/^#[0-9a-f]{6}$/i.test(v)) {
            showToast(`${mode} "${slot.label}" must be a 6-digit hex color.`, { variant: 'error' });
            return;
          }
        }
      }
      const payload = { name };
      for (const mode of ['light', 'dark']) {
        for (const slot of PALETTE_SLOTS) {
          payload[`${mode}_${slot.key}`] = draft[`${mode}_${slot.key}`];
        }
      }

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

  function blankTheme() {
    const active = themes.find((t) => t.id === activeId) || themes[0] || {};
    const out = { name: '' };
    for (const slot of PALETTE_SLOTS) {
      out[`light_${slot.key}`] = active[`light_${slot.key}`] || NEW_LIGHT[slot.key];
      out[`dark_${slot.key}`]  = active[`dark_${slot.key}`]  || NEW_DARK[slot.key];
    }
    return out;
  }

  function paletteColumn(mode, label, seed) {
    const otherMode = mode === 'light' ? 'dark' : 'light';
    return `
      <div class="rounded-lg p-4" style="border:1px solid var(--color-border)">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-semibold">${label}</span>
          <button type="button" data-copy-from="${otherMode}"
                  class="text-[11px] hover:underline" style="color:var(--color-primary)">
            Copy from ${otherMode}
          </button>
        </div>
        <div class="space-y-2">
          ${PALETTE_SLOTS.map((slot) => {
            const fullKey = `${mode}_${slot.key}`;
            const value = seed[fullKey] || (mode === 'dark' ? NEW_DARK[slot.key] : NEW_LIGHT[slot.key]);
            return `
              <label class="flex items-center gap-3 p-2 rounded-md"
                     style="border:1px solid var(--color-border)">
                <input type="color" data-field="${fullKey}"
                       value="${escapeHtml(value)}"
                       class="w-9 h-9 rounded cursor-pointer shrink-0"
                       style="border:1px solid var(--color-border); background:transparent" />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium">${escapeHtml(slot.label)}</div>
                  <input type="text" data-hex="${fullKey}" maxlength="9"
                         value="${escapeHtml(value)}"
                         class="input mt-1 text-xs font-mono" />
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
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
