import { getProduct, formatPrice } from '../services/products.js';
import { getReviews, reviewStats } from '../services/reviews.js';
import { getQuestions } from '../services/questions.js';
import { addToCart } from '../services/cart.js';
import { getFlag } from '../services/branding.js';
import { StarsDisplay } from '../components/stars.js';
import { Gallery } from '../components/gallery.js';
import { ReviewForm, ReviewItem } from '../components/review-form.js';
import { QuestionForm, QuestionItem } from '../components/question-form.js';
import { escapeHtml } from '../lib/dom.js';

export async function ProductDetailPage({ id }) {
  const root = document.createElement('div');
  root.className = 'container-x py-10';

  let product, reviews, questions;
  try {
    [product, reviews, questions] = await Promise.all([
      getProduct(id),
      getReviews(id),
      getQuestions(id),
    ]);
  } catch (e) {
    root.innerHTML = errorState(e.message);
    return root;
  }

  root.appendChild(Hero(product, reviews));
  if (product.description) root.appendChild(DescriptionSection(product));
  root.appendChild(ReviewsSection(product, reviews));
  root.appendChild(QASection(product, questions));
  return root;
}

/* ------------------------------------------------------------------ Hero */

function Hero(p, reviews) {
  const stats = reviewStats(reviews);
  const sec = document.createElement('section');
  sec.className = 'grid lg:grid-cols-2 gap-8 lg:gap-14 items-start';

  sec.appendChild(Gallery(p));

  const right = document.createElement('div');
  right.className = 'lg:pt-4';

  // Stock indicator always shows availability state. The `show_stock` flag
  // controls whether to reveal the exact quantity:
  //   ON  → "30 in stock", "Only 3 left", "Sold out"
  //   OFF → "In stock",                   "Sold out"
  const showStock = getFlag('show_stock');
  let stockLabel;
  if (p.stock <= 0) {
    stockLabel = `
      <span class="inline-flex items-center gap-1.5 text-sm" style="color:#b91c1c">
        <span class="w-2 h-2 rounded-full" style="background:#b91c1c"></span> Sold out
      </span>`;
  } else if (showStock && p.stock < 5) {
    stockLabel = `
      <span class="inline-flex items-center gap-1.5 text-sm" style="color:#b45309">
        <span class="w-2 h-2 rounded-full" style="background:#f59e0b"></span>
        Only ${p.stock} left
      </span>`;
  } else {
    stockLabel = `
      <span class="inline-flex items-center gap-1.5 text-sm" style="color:#15803d">
        <span class="w-2 h-2 rounded-full" style="background:#16a34a"></span>
        ${showStock ? `${p.stock} in stock` : 'In stock'}
      </span>`;
  }

  const showSold = getFlag('show_sold');
  const soldLine = (showSold && Number(p.sold_count) > 0)
    ? `<span class="inline-flex items-center gap-1.5 text-sm muted">
         <span class="w-2 h-2 rounded-full" style="background: var(--color-muted); opacity: 0.6"></span>
         ${new Intl.NumberFormat('en-US').format(p.sold_count)} sold
       </span>`
    : '';

  right.innerHTML = `
    <a href="#/products" class="text-sm muted hover:text-[color:var(--color-text)] inline-flex items-center gap-1">
      <span aria-hidden="true">←</span> Back to products
    </a>
    <h1 class="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">${escapeHtml(p.name)}</h1>
    <div class="mt-3 flex items-center gap-3 flex-wrap">
      <div data-stars></div>
      <span class="text-sm muted">
        ${stats.count > 0
          ? `${stats.average} · ${stats.count} review${stats.count === 1 ? '' : 's'}`
          : 'No reviews yet'}
      </span>
    </div>
    <div class="mt-6 text-3xl font-semibold tracking-tight" style="color:var(--color-primary)">
      ${formatPrice(p.price)}
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      ${stockLabel}${soldLine}
    </div>
    <div class="mt-8 flex flex-wrap gap-3 items-center">
      <button data-add class="btn btn-primary" ${p.stock <= 0 ? 'disabled' : ''}>
        ${p.stock <= 0 ? 'Sold out' : 'Add to cart'}
      </button>
      <a href="#/products" class="btn btn-ghost">Keep browsing</a>
      <span data-feedback class="text-xs muted hidden">Added to cart ✓</span>
    </div>
  `;
  right.querySelector('[data-stars]').appendChild(StarsDisplay(stats.average));

  const addBtn   = right.querySelector('[data-add]');
  const feedback = right.querySelector('[data-feedback]');
  if (addBtn && p.stock > 0) {
    addBtn.addEventListener('click', () => {
      addToCart(p.id, 1);
      feedback.classList.remove('hidden');
      clearTimeout(addBtn._t);
      addBtn._t = setTimeout(() => feedback.classList.add('hidden'), 1500);
    });
  }
  sec.appendChild(right);
  return sec;
}

/* --------------------------------------------------------- Description */

function DescriptionSection(p) {
  const sec = document.createElement('section');
  sec.className = 'mt-12 pt-10 border-t';
  sec.style.borderColor = 'var(--color-border)';
  sec.innerHTML = `
    <h2 class="text-xl font-bold tracking-tight mb-4">Description</h2>
    <div class="leading-relaxed whitespace-pre-line max-w-2xl">${escapeHtml(p.description)}</div>
  `;
  return sec;
}

/* ----------------------------------------------------------- Reviews */

function ReviewsSection(product, initialReviews) {
  const sec = document.createElement('section');
  sec.className = 'mt-16';
  let reviews = [...initialReviews];

  sec.innerHTML = `
    <div class="flex items-end justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Reviews</h2>
        <p class="text-sm muted mt-1" data-summary></p>
      </div>
    </div>
    <div class="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
      <div data-list></div>
      <div data-form></div>
    </div>
  `;

  const list = sec.querySelector('[data-list]');
  const summary = sec.querySelector('[data-summary]');
  const formSlot = sec.querySelector('[data-form]');

  function renderList() {
    const stats = reviewStats(reviews);
    summary.textContent = stats.count
      ? `${stats.average} average · ${stats.count} review${stats.count === 1 ? '' : 's'}`
      : 'Be the first to review.';

    if (reviews.length === 0) {
      list.innerHTML = `
        <div class="text-center py-12 rounded-lg muted"
             style="border:1px dashed var(--color-border); background: var(--color-surface)">
          No reviews yet.
        </div>`;
    } else {
      list.replaceChildren(...reviews.map(ReviewItem));
    }
  }

  function mountForm() {
    formSlot.replaceChildren(
      ReviewForm({
        productId: product.id,
        onSubmitted: (created) => {
          reviews = [created, ...reviews];
          renderList();
          mountForm(); // re-render so per-product / global limits show
        },
      })
    );
  }
  mountForm();
  renderList();
  return sec;
}

/* ----------------------------------------------------------- Q&A */

function QASection(product, initialQuestions) {
  const sec = document.createElement('section');
  sec.className = 'mt-16';
  let questions = [...initialQuestions];

  sec.innerHTML = `
    <div class="flex items-end justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Questions &amp; answers</h2>
        <p class="text-sm muted mt-1" data-summary></p>
      </div>
    </div>
    <div class="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
      <div data-list></div>
      <div data-form></div>
    </div>
  `;

  const list = sec.querySelector('[data-list]');
  const summary = sec.querySelector('[data-summary]');
  const formSlot = sec.querySelector('[data-form]');

  function renderList() {
    summary.textContent =
      questions.length === 0
        ? 'No questions yet — ask the first one.'
        : `${questions.length} question${questions.length === 1 ? '' : 's'}`;

    if (questions.length === 0) {
      list.innerHTML = `
        <div class="text-center py-12 rounded-lg muted"
             style="border:1px dashed var(--color-border); background: var(--color-surface)">
          No questions yet.
        </div>`;
    } else {
      list.replaceChildren(...questions.map(QuestionItem));
    }
  }

  function mountForm() {
    formSlot.replaceChildren(
      QuestionForm({
        productId: product.id,
        onSubmitted: (created) => {
          questions = [created, ...questions];
          renderList();
          mountForm(); // re-render so the counter updates / locks at limit
        },
      })
    );
  }
  mountForm();
  renderList();
  return sec;
}

/* ----------------------------------------------------------- error */

function errorState(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      <strong>Couldn't load this product.</strong>
      <div class="text-sm mt-1">${escapeHtml(msg)}</div>
      <a href="#/products" class="inline-block mt-3 text-sm underline">Back to products</a>
    </div>
  `;
}
