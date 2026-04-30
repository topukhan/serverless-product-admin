import { STATUS_META } from '../services/orders.js';
import { escapeHtml } from '../lib/dom.js';

export function statusBadge(status) {
  const meta = STATUS_META[status] || { label: status, tone: '#475569', bg: '#e2e8f0' };
  return `
    <span class="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full"
          style="background:${meta.bg};color:${meta.tone}">
      ${escapeHtml(meta.label)}
    </span>
  `;
}
