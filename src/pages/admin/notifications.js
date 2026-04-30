import {
  getNotificationConfig,
  saveNotificationConfig,
  sendTestNotification,
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

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Notifications</h1>
      <p class="muted text-sm mt-1">
        Push notifications to your phone whenever a customer places an order,
        asks a question, or leaves a review.
      </p>
    </header>

    <div class="card p-5 sm:p-6 mb-6">
      <h2 class="font-semibold text-lg">How to set up Telegram</h2>
      <ol class="text-sm muted list-decimal pl-5 mt-3 space-y-2">
        <li>
          Open Telegram, search for <strong>@BotFather</strong>, send <code>/newbot</code>
          and follow the prompts. You'll receive a bot token like
          <code class="text-xs">123456789:ABC...</code>. Copy it.
        </li>
        <li>
          Search for <strong>your new bot</strong>, open the chat, click <strong>Start</strong>,
          and send any message.
        </li>
        <li>
          Search for <strong>@userinfobot</strong>, send <code>/start</code>, and copy
          your <strong>numeric chat ID</strong>.
        </li>
        <li>Paste both below, switch <strong>Enabled</strong> on, and hit <strong>Send test</strong>.</li>
      </ol>
    </div>

    <form data-form class="card p-5 sm:p-6 space-y-5">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <div class="font-medium">Enabled</div>
          <p class="text-xs muted mt-0.5">Master switch — turn off to silence all events without losing your config.</p>
        </div>
        <label class="relative inline-flex shrink-0 cursor-pointer">
          <input data-enabled type="checkbox" class="sr-only peer" ${cfg.enabled ? 'checked' : ''} />
          <span class="block w-11 h-6 rounded-full transition" style="background: var(--color-border)"></span>
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition"></span>
        </label>
      </div>

      <div class="grid sm:grid-cols-2 gap-4 pt-2 border-t" style="border-color:var(--color-border)">
        <div class="sm:col-span-2">
          <label class="label" for="bt">Bot token</label>
          <input id="bt" data-token type="text" maxlength="200" autocomplete="off"
                 class="input font-mono text-xs"
                 placeholder="123456789:ABC..."
                 value="${escapeHtml(cfg.telegram_bot_token || '')}" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="cid">Chat ID</label>
          <input id="cid" data-chat type="text" maxlength="60" autocomplete="off"
                 class="input font-mono text-xs"
                 placeholder="123456789"
                 value="${escapeHtml(cfg.telegram_chat_id || '')}" />
          <p class="text-xs muted mt-1">
            For a personal chat this is a numeric ID. For a group, prefix with
            <code>-100</code>.
          </p>
        </div>
      </div>

      <div class="pt-2 border-t" style="border-color:var(--color-border)">
        <div class="text-sm font-medium mb-3">Notify me on</div>
        ${eventToggle('order',    'New orders',    cfg.notify_on_order)}
        ${eventToggle('question', 'New questions', cfg.notify_on_question)}
        ${eventToggle('review',   'New reviews',   cfg.notify_on_review)}
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
        <button type="button" data-test class="btn btn-ghost">Send test</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  `;

  paintToggles(root);

  const form = root.querySelector('[data-form]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'Saving…';
    try {
      const next = await saveNotificationConfig({
        enabled:            form.querySelector('[data-enabled]').checked,
        telegram_bot_token: form.querySelector('[data-token]').value.trim() || null,
        telegram_chat_id:   form.querySelector('[data-chat]').value.trim() || null,
        notify_on_order:    form.querySelector('[data-event-order]').checked,
        notify_on_question: form.querySelector('[data-event-question]').checked,
        notify_on_review:   form.querySelector('[data-event-review]').checked,
      });
      cfg = next;
      showToast('Notification settings saved', { variant: 'success' });
    } catch (err) {
      showToast(err.message || 'Save failed', { variant: 'error' });
    } finally {
      submit.disabled = false; submit.textContent = 'Save';
    }
  });

  root.querySelector('[data-test]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await sendTestNotification();
      showToast('Test sent — check your Telegram', { variant: 'success' });
    } catch (err) {
      showToast(err.message || 'Test failed — save first?', { variant: 'error' });
    } finally {
      btn.disabled = false; btn.textContent = 'Send test';
    }
  });

  return root;
}

function eventToggle(key, label, initial) {
  return `
    <label class="flex items-center gap-3 py-2">
      <input data-event-${key} type="checkbox" class="sr-only peer" ${initial ? 'checked' : ''} />
      <span class="relative inline-block w-9 h-5 rounded-full transition shrink-0"
            style="background: var(--color-border)" data-track="${key}">
        <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition"
              data-dot="${key}"></span>
      </span>
      <span class="text-sm">${escapeHtml(label)}</span>
    </label>
  `;
}

function paintToggles(root) {
  function paint(cb, track, dot) {
    if (cb.checked) {
      track.style.background = 'var(--color-primary)';
      dot.style.transform = 'translateX(16px)';
    } else {
      track.style.background = 'var(--color-border)';
      dot.style.transform = 'translateX(0)';
    }
  }
  // Master "enabled" toggle (different markup — uses block w-11 h-6).
  const enabledCb = root.querySelector('[data-enabled]');
  const enabledTrack = enabledCb.parentElement.querySelector('span:first-of-type');
  const enabledDot   = enabledCb.parentElement.querySelector('span:last-of-type');
  function paintEnabled() {
    if (enabledCb.checked) {
      enabledTrack.style.background = 'var(--color-primary)';
      enabledDot.style.transform = 'translateX(20px)';
    } else {
      enabledTrack.style.background = 'var(--color-border)';
      enabledDot.style.transform = 'translateX(0)';
    }
  }
  paintEnabled();
  enabledCb.addEventListener('change', paintEnabled);

  ['order','question','review'].forEach((k) => {
    const cb = root.querySelector(`[data-event-${k}]`);
    const track = root.querySelector(`[data-track="${k}"]`);
    const dot   = root.querySelector(`[data-dot="${k}"]`);
    paint(cb, track, dot);
    cb.addEventListener('change', () => paint(cb, track, dot));
  });
}

function errorBox(msg) {
  return `
    <div class="p-6 rounded-lg" style="background:#fef2f2;color:#991b1b">
      Failed to load settings: ${escapeHtml(msg)}
    </div>`;
}
