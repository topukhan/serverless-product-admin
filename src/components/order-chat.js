import { escapeHtml } from '../lib/dom.js';
import { showToast } from './toast.js';
import {
  customerSendMessage, customerGetMessages, customerMarkRead,
  adminSendMessage, adminGetMessages, adminMarkRead,
} from '../services/order-messages.js';

// Reusable order chat panel shared by admin and customer pages.
//   side    : 'customer' | 'admin'
//   orderId : uuid (admin uses this from the start; customer learns it
//             from the first fetch response)
//   orderNumber : 'ORD-001234' (customer uses this; admin can omit)
//   onUnreadChange : optional callback after reload + mark-read
export function OrderChat({ side, orderId = null, orderNumber = null, onUnreadChange = null }) {
  const root = document.createElement('div');
  root.className = 'card p-4 sm:p-5';
  root.dataset.orderChat = side;

  let resolvedOrderId = orderId;

  root.innerHTML = `
    <div class="flex items-center justify-between gap-3 mb-3">
      <h3 class="font-semibold text-base flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Chat with ${side === 'admin' ? 'customer' : 'support'}
      </h3>
      <span data-counter class="text-xs muted"></span>
    </div>

    <div data-feed
         class="rounded-md p-3 max-h-80 overflow-y-auto space-y-2 text-sm"
         style="background:var(--color-bg);border:1px solid var(--color-border)">
      <p data-empty class="muted text-center py-6">Loading…</p>
    </div>

    <form data-form class="mt-3 flex flex-col sm:flex-row gap-2" novalidate>
      <textarea data-body rows="2" maxlength="1000" required
                class="input flex-1 resize-y"
                placeholder="Type your message…"></textarea>
      <button type="submit" class="btn btn-primary self-end sm:self-auto sm:px-4 shrink-0"
              data-submit>Send</button>
    </form>
    <p data-status class="mt-2 text-xs muted"></p>
  `;

  const feed     = root.querySelector('[data-feed]');
  const counter  = root.querySelector('[data-counter]');
  const status   = root.querySelector('[data-status]');
  const form     = root.querySelector('[data-form]');
  const bodyEl   = root.querySelector('[data-body]');
  const submitEl = root.querySelector('[data-submit]');

  async function refresh() {
    try {
      const data = side === 'admin'
        ? await adminGetMessages(resolvedOrderId)
        : await customerGetMessages(orderNumber);
      if (!data) {
        feed.innerHTML = `<p class="muted text-center py-6">Order not found.</p>`;
        return;
      }
      if (side === 'customer') resolvedOrderId = data.order_id;
      paint(data);
      if (resolvedOrderId) {
        if (side === 'admin') await adminMarkRead(resolvedOrderId);
        else                  await customerMarkRead(resolvedOrderId);
        window.dispatchEvent(new CustomEvent('unread-messages:changed', {
          detail: { side, orderId: resolvedOrderId },
        }));
        if (onUnreadChange) onUnreadChange();
      }
    } catch (err) {
      feed.innerHTML = `<p class="text-center py-6" style="color:#b91c1c">
                          ${escapeHtml(err.message || 'Failed to load messages')}</p>`;
    }
  }

  function paint(data) {
    const { messages, used, limit, remaining } = data;
    counter.textContent = `${used} / ${limit} messages used · ${remaining} left`;
    if (!messages || messages.length === 0) {
      feed.innerHTML = `<p class="muted text-center py-6">No messages yet. Start the conversation.</p>`;
    } else {
      feed.innerHTML = messages.map((m) => bubble(m, side)).join('');
      feed.scrollTop = feed.scrollHeight;
    }
    if (remaining <= 0) {
      submitEl.disabled = true;
      bodyEl.disabled = true;
      bodyEl.placeholder = 'Message limit reached for this order.';
      status.textContent = 'No messages remaining for this order.';
      status.style.color = '#b91c1c';
    } else {
      submitEl.disabled = false;
      bodyEl.disabled = false;
      bodyEl.placeholder = 'Type your message…';
      status.textContent = side === 'admin'
        ? `You can send up to ${remaining} more message${remaining === 1 ? '' : 's'} on this order.`
        : `You have ${remaining} message${remaining === 1 ? '' : 's'} left for this order.`;
      status.style.color = '';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = bodyEl.value.trim();
    if (!body) return;
    if (!resolvedOrderId) return;
    submitEl.disabled = true;
    submitEl.textContent = 'Sending…';
    try {
      if (side === 'admin') await adminSendMessage(resolvedOrderId, body);
      else                  await customerSendMessage(resolvedOrderId, body);
      bodyEl.value = '';
      await refresh();
    } catch (err) {
      showToast(err.message || 'Send failed', { variant: 'error' });
    } finally {
      submitEl.disabled = false;
      submitEl.textContent = 'Send';
    }
  });

  refresh();
  return root;
}

function bubble(m, side) {
  const mine = m.sender_role === side;
  const align = mine ? 'items-end' : 'items-start';
  const bg    = mine ? 'background:var(--color-primary);color:#fff'
                     : 'background:var(--color-surface);border:1px solid var(--color-border)';
  const who   = m.sender_role === 'admin' ? 'Support' : 'Customer';
  const time  = new Date(m.created_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `
    <div class="flex flex-col ${align}">
      <div class="rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words"
           style="${bg}">${escapeHtml(m.body)}</div>
      <div class="text-[11px] muted mt-0.5">${escapeHtml(who)} · ${time}</div>
    </div>
  `;
}
