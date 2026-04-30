import {
  getAdminQuestions,
  answerQuestion,
  deleteQuestion,
  setQuestionEnabled,
} from '../../services/admin-questions.js';
import { Toggle } from '../../components/toggle.js';
import { confirmDialog } from '../../components/dialog.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml, formatDate } from '../../lib/dom.js';

export async function AdminQuestionsPage() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-3xl';

  let questions = [];
  try {
    questions = await getAdminQuestions();
  } catch (e) {
    root.innerHTML = errorBox(e.message);
    return root;
  }

  let query = '';
  let unansweredOnly = false;

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Questions &amp; answers</h1>
      <p class="muted text-sm mt-1" data-summary></p>
    </header>

    <div class="flex flex-col sm:flex-row gap-3 sm:items-center mb-5">
      <input data-search type="search" placeholder="Search questions, answers, products…"
             class="input sm:max-w-sm" />
      <label class="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
        <input data-toggle type="checkbox" class="w-4 h-4"
               style="accent-color: var(--color-primary)" />
        <span>Unanswered only</span>
      </label>
    </div>

    <div data-list class="space-y-3"></div>
    <div data-empty class="hidden text-center py-14 rounded-lg"
         style="border:1px dashed var(--color-border); background: var(--color-surface)">
      <p class="font-medium" data-empty-title>No questions yet</p>
      <p class="text-sm muted mt-1" data-empty-sub>Customer questions will appear here.</p>
    </div>
  `;

  const summaryEl = root.querySelector('[data-summary]');
  const search    = root.querySelector('[data-search]');
  const toggle    = root.querySelector('[data-toggle]');
  const listEl    = root.querySelector('[data-list]');
  const emptyEl   = root.querySelector('[data-empty]');
  const emptyTitle = root.querySelector('[data-empty-title]');
  const emptySub   = root.querySelector('[data-empty-sub]');

  function applyFilters() {
    let out = questions;
    if (unansweredOnly) out = out.filter((q) => !isAnswered(q));
    if (query) {
      const lc = query.toLowerCase();
      out = out.filter((q) =>
        (q.question || '').toLowerCase().includes(lc) ||
        (q.answer   || '').toLowerCase().includes(lc) ||
        (q.product?.name || '').toLowerCase().includes(lc)
      );
    }
    return out;
  }

  function rerender() {
    const total = questions.length;
    const unansweredCount = questions.filter((q) => !isAnswered(q)).length;
    const filtered = applyFilters();

    if (total === 0) {
      summaryEl.textContent = 'No questions yet';
    } else {
      const baseSummary = `${total} question${total === 1 ? '' : 's'}`;
      const unansweredFrag = unansweredCount > 0
        ? ` · ${unansweredCount} unanswered`
        : ' · all answered';
      summaryEl.innerHTML = filtered.length === total
        ? baseSummary + unansweredFrag
        : `${filtered.length} of ${total} matching`;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '';
      emptyTitle.textContent =
        total === 0 ? 'No questions yet'
        : unansweredOnly && unansweredCount === 0 ? 'All caught up'
        : 'No matches';
      emptySub.textContent =
        total === 0 ? 'Customer questions will appear here.'
        : unansweredOnly && unansweredCount === 0 ? 'Every question has an answer. Nice work.'
        : 'Try a different search.';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.replaceChildren(...filtered.map((q) => questionRow(q, {
      onUpdated: rerender,
      onDeleted: () => {
        questions = questions.filter((x) => x.id !== q.id);
        rerender();
      },
    })));
  }

  search.addEventListener('input', () => {
    query = search.value.trim();
    rerender();
  });
  toggle.addEventListener('change', () => {
    unansweredOnly = toggle.checked;
    rerender();
  });

  rerender();
  return root;
}

/* ---------- Single row ---------- */

function questionRow(q, { onUpdated, onDeleted }) {
  const card = document.createElement('article');
  card.className = 'card p-5';
  let editing = false;

  function paint() {
    const answered = isAnswered(q);

    if (editing) {
      card.innerHTML = `
        ${header(q, false /* no badge while editing */)}
        <div class="mt-4 ml-9">
          <label class="label">Your answer</label>
          <textarea data-answer class="input resize-y" rows="3"
                    placeholder="Write a helpful answer…">${escapeHtml(q.answer || '')}</textarea>
          <p class="text-xs muted mt-1">Leave blank and save to mark as unanswered.</p>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button data-cancel type="button" class="btn btn-ghost text-xs">Cancel</button>
          <button data-save   type="button" class="btn btn-primary text-xs">Save answer</button>
        </div>
      `;
      const ta = card.querySelector('[data-answer]');
      ta.focus();
      // Place cursor at end.
      ta.setSelectionRange(ta.value.length, ta.value.length);

      card.querySelector('[data-cancel]').addEventListener('click', () => {
        editing = false;
        paint();
      });

      const saveBtn = card.querySelector('[data-save]');
      async function save() {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          const updated = await answerQuestion(q.id, ta.value);
          q.answer = updated.answer;
          editing = false;
          showToast(updated.answer ? 'Answer saved' : 'Answer cleared', { variant: 'success' });
          paint();
          onUpdated?.();
        } catch (err) {
          showToast(err.message || 'Save failed', { variant: 'error' });
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save answer';
        }
      }
      saveBtn.addEventListener('click', save);
      ta.addEventListener('keydown', (e) => {
        // Cmd/Ctrl+Enter saves, Escape cancels.
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { editing = false; paint(); }
      });
    } else {
      const dim = q.enabled === false ? 'opacity: 0.55;' : '';
      card.innerHTML = `
        <div style="${dim}">
          ${header(q, !answered)}
          ${answered ? `
            <div class="mt-3 ml-9 flex items-start gap-3">
              <span class="mt-0.5 inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-semibold text-white shrink-0"
                    style="background: var(--color-primary)">A</span>
              <p class="flex-1 leading-relaxed whitespace-pre-line">${escapeHtml(q.answer)}</p>
            </div>
          ` : ''}
        </div>
        <div class="mt-4 flex items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-xs muted">
            <span data-toggle-slot></span>
            <span>Show on public site</span>
          </label>
          <div class="flex gap-2">
            <button data-edit   class="btn btn-ghost text-xs">${answered ? 'Edit answer' : 'Answer'}</button>
            <button data-delete class="btn btn-ghost text-xs" style="color:#b91c1c">Delete</button>
          </div>
        </div>
        ${q.enabled === false
          ? `<p class="mt-2 text-[11px] muted">Hidden from public Q&amp;A on the product page.</p>`
          : ''}
      `;

      const toggle = Toggle({
        initial: q.enabled !== false,
        ariaLabel: 'Show question on public site',
        onChange: async (next) => {
          try {
            await setQuestionEnabled(q.id, next);
            q.enabled = next;
            showToast(next ? 'Question shown' : 'Question hidden', { variant: 'success' });
            paint();
          } catch (err) {
            showToast(err.message || 'Update failed', { variant: 'error' });
            throw err;
          }
        },
      });
      card.querySelector('[data-toggle-slot]').replaceWith(toggle.el);

      card.querySelector('[data-edit]').addEventListener('click', () => {
        editing = true;
        paint();
      });

      card.querySelector('[data-delete]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete this question?',
          message: `On ${q.product?.name || 'a product'}. The customer's question${answered ? ' and your answer' : ''} will be permanently removed. (To temporarily hide it, use the Show toggle instead.)`,
          confirmText: 'Delete question',
          variant: 'danger',
        });
        if (!ok) return;
        try {
          await deleteQuestion(q.id);
          showToast('Question deleted', { variant: 'success' });
          onDeleted();
        } catch (err) {
          showToast(err.message || 'Delete failed', { variant: 'error' });
        }
      });
    }
  }

  paint();
  return card;
}

function header(q, showAwaitingBadge) {
  return `
    <div class="flex items-start gap-3">
      <span class="mt-0.5 inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-semibold shrink-0"
            style="background: var(--color-primary-soft); color: var(--color-primary)">Q</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium leading-relaxed">${escapeHtml(q.question)}</p>
        <p class="text-xs muted mt-0.5">
          ${q.product?.id
            ? `<a href="#/product/${q.product.id}" class="hover:underline">${escapeHtml(q.product.name)}</a>`
            : `<span class="italic">deleted product</span>`}
          · ${formatDate(q.created_at)}
        </p>
      </div>
      ${showAwaitingBadge
        ? `<span class="text-[11px] font-medium px-2 py-1 rounded-full shrink-0"
                style="background:#fef3c7;color:#92400e">Awaiting answer</span>`
        : ''}
    </div>
  `;
}

function isAnswered(q) {
  return !!(q.answer && q.answer.trim());
}

function errorBox(msg) {
  return `<div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">Failed to load: ${escapeHtml(msg)}</div>`;
}
