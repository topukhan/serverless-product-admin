import { createQuestion } from '../services/questions.js';
import {
  canAskQuestionFor,
  noteQuestionAskedFor,
} from '../services/question-limit.js';
import { escapeHtml, formatDate } from '../lib/dom.js';

export function QuestionForm({ productId, onSubmitted }) {
  if (!canAskQuestionFor(productId)) {
    const el = document.createElement('div');
    el.className = 'card p-5 sm:p-6';
    el.innerHTML = `
      <div class="text-sm font-semibold">Ask a question</div>
      <div class="mt-3 flex items-start gap-3">
        <div class="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center"
             style="background: var(--color-primary-soft); color: var(--color-primary)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-medium">Thanks for your questions!</p>
          <p class="text-sm muted mt-1 leading-relaxed">The store will get back to you on this product.</p>
        </div>
      </div>
    `;
    return el;
  }

  const form = document.createElement('form');
  form.className = 'card p-5 sm:p-6';
  form.innerHTML = `
    <div class="text-sm font-semibold">Ask a question</div>
    <div class="mt-4">
      <label class="label" for="q-text">Your question <span style="color:#b91c1c">*</span></label>
      <textarea id="q-text" name="question" rows="3" maxlength="500" required
                class="input resize-y"
                placeholder="What size should I order?"></textarea>
    </div>
    <div class="mt-4 flex items-center justify-between gap-3">
      <p class="text-xs muted" data-status>The store will answer publicly.</p>
      <button type="submit" class="btn btn-primary">Ask question</button>
    </div>
  `;

  const status = form.querySelector('[data-status]');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const question = String(fd.get('question') || '').trim();
    if (!question) return setStatus('Please type a question.', true);

    if (!canAskQuestionFor(productId)) {
      return setStatus("Thanks, you can't post another question right now.", true);
    }

    submit.disabled = true;
    setStatus('Sending…');

    try {
      const created = await createQuestion({ productId, question });
      noteQuestionAskedFor(productId);
      setStatus(`Thanks! Your question is posted.`);
      onSubmitted?.(created);
    } catch (err) {
      setStatus(err.message || 'Something went wrong.', true);
      submit.disabled = false;
    }
  });

  function setStatus(msg, isError = false) {
    status.textContent = msg;
    status.style.color = isError ? '#b91c1c' : 'var(--color-muted)';
  }

  return form;
}

export function QuestionItem(q) {
  const el = document.createElement('article');
  el.className = 'py-5';
  el.style.borderBottom = '1px solid var(--color-border)';
  el.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="mt-0.5 inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-semibold"
            style="background: var(--color-primary-soft); color: var(--color-primary)">Q</span>
      <div class="flex-1">
        <p class="font-medium">${escapeHtml(q.question)}</p>
        <p class="text-xs muted mt-0.5">Asked ${formatDate(q.created_at)}</p>
      </div>
    </div>
    ${q.answer ? `
      <div class="mt-3 ml-9 flex items-start gap-3">
        <span class="mt-0.5 inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-semibold text-white"
              style="background: var(--color-primary)">A</span>
        <p class="flex-1 leading-relaxed">${escapeHtml(q.answer)}</p>
      </div>
    ` : `
      <div class="mt-2 ml-9 text-xs muted italic">Awaiting answer from the store.</div>
    `}
  `;
  return el;
}
