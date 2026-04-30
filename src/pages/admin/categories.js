import {
  getAdminCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  setCategoryEnabled,
} from '../../services/admin-categories.js';
import { Toggle } from '../../components/toggle.js';
import { confirmDialog } from '../../components/dialog.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

export async function AdminCategoriesPage() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-2xl';

  let categories = [];
  try {
    categories = await getAdminCategories();
  } catch (e) {
    root.innerHTML = errorBox(e.message);
    return root;
  }

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Categories</h1>
      <p class="muted text-sm mt-1" data-summary></p>
    </header>

    <form data-add class="card p-4 flex gap-2 mb-6">
      <input data-name class="input flex-1" required maxlength="60"
             placeholder="New category name" autocomplete="off" />
      <button class="btn btn-primary" type="submit">Add</button>
    </form>

    <div data-list class="space-y-3"></div>
    <div data-empty class="hidden text-center py-14 rounded-lg"
         style="border:1px dashed var(--color-border); background: var(--color-surface)">
      <p class="font-medium">No categories yet.</p>
      <p class="text-sm muted mt-1">Add one above to start tagging products.</p>
    </div>
  `;

  const summaryEl = root.querySelector('[data-summary]');
  const listEl = root.querySelector('[data-list]');
  const emptyEl = root.querySelector('[data-empty]');
  const addForm = root.querySelector('[data-add]');
  const addInput = addForm.querySelector('[data-name]');
  const addBtn = addForm.querySelector('button[type="submit"]');

  function rerender() {
    summaryEl.textContent = categories.length === 0
      ? 'No categories yet.'
      : `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`;

    if (categories.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
    } else {
      emptyEl.classList.add('hidden');
      listEl.replaceChildren(...categories.map(buildRow));
    }
  }

  function buildRow(cat) {
    return categoryRow(cat, {
      onRenamed: (newName) => {
        cat.name = newName;
        categories.sort((a, b) => a.name.localeCompare(b.name));
        rerender();
      },
      onDeleted: () => {
        categories = categories.filter((c) => c.id !== cat.id);
        rerender();
      },
    });
  }

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = addInput.value.trim();
    if (!name) return;

    addBtn.disabled = true;
    addBtn.textContent = 'Adding…';
    try {
      const created = await createCategory(name);
      categories.push({ ...created, productCount: 0 });
      categories.sort((a, b) => a.name.localeCompare(b.name));
      addInput.value = '';
      rerender();
      showToast('Category added', { variant: 'success' });
      addInput.focus();
    } catch (err) {
      showToast(err.message || 'Add failed', { variant: 'error' });
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = 'Add';
    }
  });

  rerender();
  return root;
}

/* ---------- Single row component ---------- */

function categoryRow(cat, { onRenamed, onDeleted }) {
  const row = document.createElement('div');
  row.className = 'card p-4 flex items-center gap-4';

  function paintView() {
    const dim = cat.enabled === false ? 'opacity: 0.55;' : '';
    row.innerHTML = `
      <div class="flex-1 min-w-0" style="${dim}">
        <div class="flex items-center gap-2">
          <span class="font-medium">${escapeHtml(cat.name)}</span>
          ${cat.enabled === false
            ? `<span class="text-[11px] font-medium px-2 py-0.5 rounded-full"
                     style="background: var(--color-bg); color: var(--color-muted)">Disabled</span>`
            : ''}
        </div>
        <div class="text-xs muted mt-0.5">${usageLabel(cat.productCount)}</div>
      </div>
      <span data-toggle-slot></span>
      <div class="flex gap-2 shrink-0">
        <button data-edit class="btn btn-ghost text-xs">Rename</button>
        <button data-delete class="btn btn-ghost text-xs" style="color:#b91c1c">Delete</button>
      </div>
    `;

    const toggle = Toggle({
      initial: cat.enabled !== false,
      ariaLabel: `Enable ${cat.name}`,
      onChange: async (next) => {
        try {
          await setCategoryEnabled(cat.id, next);
          cat.enabled = next;
          showToast(next ? 'Category enabled' : 'Category disabled', { variant: 'success' });
          paintView();
        } catch (err) {
          showToast(err.message || 'Update failed', { variant: 'error' });
          throw err;
        }
      },
    });
    row.querySelector('[data-toggle-slot]').replaceWith(toggle.el);

    row.querySelector('[data-edit]').addEventListener('click', paintEdit);
    row.querySelector('[data-delete]').addEventListener('click', handleDelete);
  }

  function paintEdit() {
    row.innerHTML = `
      <input data-name class="input flex-1" maxlength="60"
             value="${escapeHtml(cat.name)}" autocomplete="off" />
      <div class="flex gap-2 shrink-0">
        <button data-cancel type="button" class="btn btn-ghost text-xs">Cancel</button>
        <button data-save   type="button" class="btn btn-primary text-xs">Save</button>
      </div>
    `;
    const input  = row.querySelector('[data-name]');
    const saveBtn = row.querySelector('[data-save]');
    input.focus();
    input.select();

    async function save() {
      const newName = input.value.trim();
      if (!newName) {
        showToast('Name is required.', { variant: 'error' });
        input.focus();
        return;
      }
      if (newName === cat.name) {
        paintView();
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        await renameCategory(cat.id, newName);
        showToast('Renamed', { variant: 'success' });
        onRenamed(newName);
      } catch (err) {
        showToast(err.message || 'Rename failed', { variant: 'error' });
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        input.focus();
      }
    }

    row.querySelector('[data-cancel]').addEventListener('click', paintView);
    saveBtn.addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')   { e.preventDefault(); save(); }
      else if (e.key === 'Escape') paintView();
    });
  }

  async function handleDelete() {
    const message = cat.productCount > 0
      ? `This category is currently tagged on ${cat.productCount} product${cat.productCount === 1 ? '' : 's'}. ` +
        `The products won't be deleted — they'll just lose this tag.`
      : `No products are using this category yet.`;
    const ok = await confirmDialog({
      title: `Delete "${cat.name}"?`,
      message,
      confirmText: 'Delete category',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteCategory(cat.id);
      showToast('Category deleted', { variant: 'success' });
      onDeleted();
    } catch (err) {
      showToast(err.message || 'Delete failed', { variant: 'error' });
    }
  }

  paintView();
  return row;
}

function usageLabel(n) {
  if (n === 0) return 'Unused';
  if (n === 1) return 'Used by 1 product';
  return `Used by ${n} products`;
}

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      Failed to load categories: ${escapeHtml(msg)}
    </div>`;
}
