import { createReview } from '../services/reviews.js';
import {
  canSubmitReviewFor,
  hasReviewedProduct,
  noteReviewSubmittedFor,
  canSubmitReview,
} from '../services/review-limit.js';
import { StarsInput } from './stars.js';
import { escapeHtml } from '../lib/dom.js';

export function ReviewForm({ productId, onSubmitted }) {
  // Two distinct lock reasons. The copy is intentionally vague (no numbers)
  // — the user doesn't want to surface limit values to customers.
  if (hasReviewedProduct(productId)) {
    return lockedCard(
      "You've already reviewed this product",
      'Thanks for sharing your thoughts!'
    );
  }
  if (!canSubmitReview()) {
    return lockedCard(
      'Thanks for your reviews!',
      'Hope you found what you were looking for.'
    );
  }

  const stars = StarsInput({ initial: 5 });

  const form = document.createElement('form');
  form.className = 'card p-5 sm:p-6';
  form.innerHTML = `
    <div class="text-sm font-semibold">Write a review</div>
    <div class="mt-4 grid sm:grid-cols-2 gap-4">
      <div>
        <label class="label" for="rv-name">Your name <span style="color:#b91c1c">*</span></label>
        <input id="rv-name" name="name" required maxlength="60"
               class="input" placeholder="Jane Doe" />
      </div>
      <div>
        <label class="label">Rating <span style="color:#b91c1c">*</span></label>
        <div data-stars></div>
      </div>
    </div>
    <div class="mt-4">
      <label class="label" for="rv-comment">Comment <span style="color:#b91c1c">*</span></label>
      <textarea id="rv-comment" name="comment" rows="3" maxlength="2000" required
                class="input resize-y" placeholder="What did you think?"></textarea>
    </div>
    <div class="mt-4 flex items-center justify-between gap-3">
      <p class="text-xs muted" data-status></p>
      <button type="submit" class="btn btn-primary">Post review</button>
    </div>
  `;

  form.querySelector('[data-stars]').appendChild(stars.el);
  const status = form.querySelector('[data-status]');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const userName = String(fd.get('name') || '').trim();
    const comment  = String(fd.get('comment') || '').trim();
    const rating   = stars.getValue();

    if (!userName)  return setStatus('Please enter your name.', true);
    if (!comment)   return setStatus('Please write a comment.', true);
    if (rating < 1) return setStatus('Please pick a star rating.', true);

    // Re-check both limits in case the user has another tab open.
    if (!canSubmitReviewFor(productId)) {
      return setStatus(
        hasReviewedProduct(productId)
          ? "You've already reviewed this product."
          : "Thanks, you can't post another review right now.",
        true
      );
    }

    submit.disabled = true;
    setStatus('Posting…');

    try {
      const created = await createReview({ productId, userName, rating, comment });
      noteReviewSubmittedFor(productId);
      setStatus('Thanks! Your review is posted.');
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

function lockedCard(title, body) {
  const el = document.createElement('div');
  el.className = 'card p-5 sm:p-6';
  el.innerHTML = `
    <div class="text-sm font-semibold">Write a review</div>
    <div class="mt-3 flex items-start gap-3">
      <div class="shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center"
           style="background: var(--color-primary-soft); color: var(--color-primary)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div>
        <p class="text-sm font-medium">${escapeHtml(title)}</p>
        <p class="text-sm muted mt-1 leading-relaxed">${escapeHtml(body)}</p>
      </div>
    </div>
  `;
  return el;
}

export function ReviewItem(r) {
  const el = document.createElement('article');
  el.className = 'py-5';
  el.style.borderBottom = '1px solid var(--color-border)';
  const date = new Date(r.created_at).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  const starsRow = document.createElement('span');
  starsRow.className = 'inline-flex gap-0.5 text-sm leading-none';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = i <= r.rating ? '★' : '☆';
    s.style.color = i <= r.rating ? 'var(--color-accent)' : 'var(--color-border)';
    starsRow.appendChild(s);
  }

  el.innerHTML = `
    <header class="flex items-center justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
             style="background: var(--color-primary)">
          ${escapeHtml(r.user_name?.[0]?.toUpperCase() || '?')}
        </div>
        <div>
          <div class="text-sm font-semibold">${escapeHtml(r.user_name)}</div>
          <div class="text-xs muted">${date}</div>
        </div>
      </div>
      <div data-stars></div>
    </header>
    ${r.comment ? `<p class="mt-3 leading-relaxed">${escapeHtml(r.comment)}</p>` : ''}
  `;
  el.querySelector('[data-stars]').appendChild(starsRow);
  return el;
}
