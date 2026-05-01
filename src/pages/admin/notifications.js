import {
  getNotificationConfig,
  saveNotificationConfig,
  sendTestTelegram,
  sendTestEmail,
} from '../../services/admin-notifications.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

export async function AdminNotificationsPage() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-2xl';

  let cfg;
  try {
    cfg = await getNotificationConfig();
  } catch (e) {
    root.innerHTML = errorBox(e.message);
    return root;
  }

  // Active tab key, persisted within the page (not across navigations).
  let activeTab = 'telegram';

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Notifications</h1>
      <p class="muted text-sm mt-1">
        Push alerts when a customer places an order, asks a question, or
        leaves a review. Pick a channel below — you can enable both.
      </p>
    </header>

    <!-- Site URL -->
    <div class="card p-5 sm:p-6 mb-6">
      <label class="label" for="site-url">Site URL</label>
      <input id="site-url" data-site-url type="url" class="input" maxlength="300"
             placeholder="https://yourstore.com"
             value="${escapeHtml(cfg.site_url || '')}" />
      <p class="text-xs muted mt-1.5">
        Added to every notification as a clickable link — e.g. order alerts include a direct link to that order in the admin panel.
      </p>
    </div>

    <!-- Master + per-event toggles (shared across channels) -->
    <div class="card p-5 sm:p-6 mb-6 space-y-4">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <div class="font-medium">Notifications enabled</div>
          <p class="text-xs muted mt-0.5">Master switch — turn off to silence every channel without losing config.</p>
        </div>
        ${bigToggle('master', cfg.enabled)}
      </div>
      <div class="pt-2 border-t" style="border-color:var(--color-border)">
        <div class="text-sm font-medium mb-2">Notify me on</div>
        ${eventRow('order',    'New orders',    cfg.notify_on_order)}
        ${eventRow('question', 'New questions', cfg.notify_on_question)}
        ${eventRow('review',   'New reviews',   cfg.notify_on_review)}
      </div>
    </div>

    <!-- Tab nav -->
    <div class="flex gap-1 mb-4" role="tablist" data-tabs>
      ${tabBtn('telegram', 'Telegram', activeTab)}
      ${tabBtn('email',    'Email',    activeTab)}
    </div>

    <div data-panel-telegram>${telegramPanel(cfg)}</div>
    <div data-panel-email class="hidden">${emailPanel(cfg)}</div>

    <div class="mt-6 flex justify-end">
      <button data-save type="button" class="btn btn-primary">Save</button>
    </div>
  `;

  const masterCb = root.querySelector('[data-toggle="master"]');
  const telegramEl = root.querySelector('[data-panel-telegram]');
  const emailEl = root.querySelector('[data-panel-email]');

  paintAllToggles(root);

  /* ---------- Tab switching ---------- */
  root.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((x) => paintTab(x, activeTab));
      telegramEl.classList.toggle('hidden', activeTab !== 'telegram');
      emailEl.classList.toggle('hidden', activeTab !== 'email');
    });
  });

  /* ---------- Save ---------- */
  root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      cfg = await saveNotificationConfig({
        site_url:           root.querySelector('[data-site-url]').value.trim() || null,
        enabled:            masterCb.checked,
        notify_on_order:    root.querySelector('[data-event-order]').checked,
        notify_on_question: root.querySelector('[data-event-question]').checked,
        notify_on_review:   root.querySelector('[data-event-review]').checked,
        // Telegram
        telegram_enabled:   root.querySelector('[data-toggle="telegram-enabled"]').checked,
        telegram_bot_token: root.querySelector('[data-tg-token]').value.trim() || null,
        telegram_chat_id:   root.querySelector('[data-tg-chat]').value.trim() || null,
        // Email
        email_enabled:      root.querySelector('[data-toggle="email-enabled"]').checked,
        email_api_key:      root.querySelector('[data-email-key]').value.trim() || null,
        email_from:         root.querySelector('[data-email-from]').value.trim() || null,
        email_to:           root.querySelector('[data-email-to]').value.trim() || null,
      });
      showToast('Settings saved', { variant: 'success' });
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
    } finally {
      btn.disabled = false; btn.textContent = 'Save';
    }
  });

  /* ---------- Test buttons ---------- */
  root.querySelector('[data-test-telegram]').addEventListener('click', async (e) => {
    await runTest(e.currentTarget, sendTestTelegram, 'Test sent — check Telegram');
  });
  root.querySelector('[data-test-email]').addEventListener('click', async (e) => {
    await runTest(e.currentTarget, sendTestEmail, 'Test sent — check your inbox');
  });

  return root;
}

async function runTest(btn, fn, successMsg) {
  btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Sending…';
  try {
    await fn();
    showToast(successMsg, { variant: 'success' });
  } catch (err) {
    showToast(err.message || 'Test failed — save first?', { variant: 'error' });
  } finally {
    btn.disabled = false; btn.textContent = prev;
  }
}

/* ---------- Tab panels ---------- */

function telegramPanel(cfg) {
  return `
    <div class="card p-5 sm:p-6 space-y-5">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <h2 class="font-semibold">Telegram</h2>
          <p class="text-xs muted mt-0.5">
            Free, instant push to your phone. Token from @BotFather, chat ID from @userinfobot.
          </p>
        </div>
        ${bigToggle('telegram-enabled', cfg.telegram_enabled !== false)}
      </div>

      <details class="rounded-md p-3" style="background: var(--color-bg)">
        <summary class="text-sm font-medium cursor-pointer">How to set up</summary>
        <ol class="text-xs muted list-decimal pl-5 mt-3 space-y-1.5">
          <li>Telegram → search <strong>@BotFather</strong> → send <code>/newbot</code> →
              follow prompts → BotFather replies with a token like
              <code>123456789:ABC...</code>. Copy it.</li>
          <li>Open your new bot's chat → tap <strong>Start</strong> → send any message.</li>
          <li>In Telegram, search <strong>@userinfobot</strong> → <code>/start</code> → copy your numeric chat ID.</li>
          <li>Paste both below, save, then <strong>Send test</strong>.</li>
        </ol>
      </details>

      <div>
        <label class="label" for="tg-token">Bot token</label>
        <input id="tg-token" data-tg-token type="text" maxlength="200" autocomplete="off"
               class="input font-mono text-xs"
               placeholder="123456789:ABC..."
               value="${escapeHtml(cfg.telegram_bot_token || '')}" />
      </div>
      <div>
        <label class="label" for="tg-chat">Chat ID</label>
        <input id="tg-chat" data-tg-chat type="text" maxlength="60" autocomplete="off"
               class="input font-mono text-xs"
               placeholder="123456789"
               value="${escapeHtml(cfg.telegram_chat_id || '')}" />
        <p class="text-xs muted mt-1">For groups, prefix with <code>-100</code>.</p>
      </div>

      <div class="flex justify-end">
        <button data-test-telegram type="button" class="btn btn-ghost text-sm">Send test</button>
      </div>
    </div>
  `;
}

function emailPanel(cfg) {
  return `
    <div class="card p-5 sm:p-6 space-y-5">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <h2 class="font-semibold">Email (via Resend)</h2>
          <p class="text-xs muted mt-0.5">
            Free 100 emails/day on <a href="https://resend.com" target="_blank" rel="noopener" class="underline">Resend's</a> free tier. Phone Gmail app gets a push.
          </p>
        </div>
        ${bigToggle('email-enabled', cfg.email_enabled)}
      </div>

      <details class="rounded-md p-3" style="background: var(--color-bg)">
        <summary class="text-sm font-medium cursor-pointer">How to set up</summary>
        <ol class="text-xs muted list-decimal pl-5 mt-3 space-y-1.5">
          <li>Sign up at <a href="https://resend.com" target="_blank" rel="noopener" class="underline">resend.com</a> (free).</li>
          <li>Create an API key in the Resend dashboard.</li>
          <li>For testing, use <code>onboarding@resend.dev</code> as the From address — it works without domain verification but only delivers to your signup email.</li>
          <li>For production, verify your own domain in Resend, then set From to <code>alerts@yourdomain.com</code> (any prefix on your verified domain).</li>
          <li>Paste the API key + To address below, switch <strong>Email enabled</strong> on, save, then <strong>Send test</strong>.</li>
        </ol>
      </details>

      <div>
        <label class="label" for="em-key">Resend API key</label>
        <input id="em-key" data-email-key type="text" maxlength="200" autocomplete="off"
               class="input font-mono text-xs"
               placeholder="re_..."
               value="${escapeHtml(cfg.email_api_key || '')}" />
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="label" for="em-from">From</label>
          <input id="em-from" data-email-from type="text" maxlength="160"
                 class="input text-sm"
                 placeholder="onboarding@resend.dev"
                 value="${escapeHtml(cfg.email_from || 'onboarding@resend.dev')}" />
        </div>
        <div>
          <label class="label" for="em-to">To</label>
          <input id="em-to" data-email-to type="email" maxlength="160"
                 class="input text-sm"
                 placeholder="you@example.com"
                 value="${escapeHtml(cfg.email_to || '')}" />
        </div>
      </div>

      <div class="flex justify-end">
        <button data-test-email type="button" class="btn btn-ghost text-sm">Send test</button>
      </div>
    </div>
  `;
}

/* ---------- Tiny UI helpers ---------- */

function tabBtn(key, label, active) {
  const isActive = key === active;
  return `
    <button data-tab="${key}"
            class="text-sm px-4 py-2 rounded-md transition"
            style="border:1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'};
                   background:${isActive ? 'var(--color-primary)' : 'var(--color-surface)'};
                   color:${isActive ? '#fff' : 'var(--color-text)'}">
      ${escapeHtml(label)}
    </button>
  `;
}

function paintTab(btn, active) {
  const isActive = btn.dataset.tab === active;
  btn.style.background = isActive ? 'var(--color-primary)' : 'var(--color-surface)';
  btn.style.color = isActive ? '#fff' : 'var(--color-text)';
  btn.style.borderColor = isActive ? 'var(--color-primary)' : 'var(--color-border)';
}

function bigToggle(key, initial) {
  return `
    <label class="relative inline-flex shrink-0 cursor-pointer">
      <input data-toggle="${key}"
             type="checkbox" class="sr-only peer" ${initial ? 'checked' : ''} />
      <span class="block w-11 h-6 rounded-full transition" style="background: var(--color-border)"></span>
      <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition"></span>
    </label>
  `;
}

function eventRow(key, label, initial) {
  return `
    <label class="flex items-center gap-3 py-1.5">
      <input data-event-${key} type="checkbox" class="sr-only peer" ${initial ? 'checked' : ''} />
      <span class="relative inline-block w-9 h-5 rounded-full transition shrink-0"
            style="background: var(--color-border)" data-track-event="${key}">
        <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition"
              data-dot-event="${key}"></span>
      </span>
      <span class="text-sm">${escapeHtml(label)}</span>
    </label>
  `;
}

function paintAllToggles(root) {
  /* Big toggles (master + telegram-enabled + email-enabled) */
  root.querySelectorAll('[data-toggle]').forEach((cb) => {
    const track = cb.parentElement.querySelector('span:first-of-type');
    const dot   = cb.parentElement.querySelector('span:last-of-type');
    function paint() {
      if (cb.checked) {
        track.style.background = 'var(--color-primary)';
        dot.style.transform = 'translateX(20px)';
      } else {
        track.style.background = 'var(--color-border)';
        dot.style.transform = 'translateX(0)';
      }
    }
    paint();
    cb.addEventListener('change', paint);
  });

  /* Small event toggles */
  ['order','question','review'].forEach((k) => {
    const cb = root.querySelector(`[data-event-${k}]`);
    if (!cb) return;
    const track = root.querySelector(`[data-track-event="${k}"]`);
    const dot   = root.querySelector(`[data-dot-event="${k}"]`);
    function paint() {
      if (cb.checked) {
        track.style.background = 'var(--color-primary)';
        dot.style.transform = 'translateX(16px)';
      } else {
        track.style.background = 'var(--color-border)';
        dot.style.transform = 'translateX(0)';
      }
    }
    paint();
    cb.addEventListener('change', paint);
  });
}

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      Failed to load settings: ${escapeHtml(msg)}
    </div>`;
}
