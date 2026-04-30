// Reusable date range picker. Renders preset buttons + optional custom range.
// Calls onChange({ from, to, presetKey, label }) whenever the selection changes.
//
//   const dr = DateRange({ initial: 'last_30', onChange: (r) => ... });
//   container.appendChild(dr.el);
//   dr.getValue() -> { from: ISO, to: ISO, presetKey, label }

const PRESETS = [
  { key: 'today',     label: 'Today',         days: 0,   custom: false },
  { key: 'last_7',    label: 'Last 7 days',   days: 7,   custom: false },
  { key: 'this_month',label: 'This month',    days: -1,  custom: false }, // sentinel
  { key: 'last_30',   label: 'Last 30 days',  days: 30,  custom: false },
  { key: 'last_90',   label: 'Last 90 days',  days: 90,  custom: false },
  { key: 'custom',    label: 'Custom',        days: null, custom: true  },
];

export function DateRange({
  initial = 'last_30',
  initialFrom = null,
  initialTo = null,
  onChange = () => {},
} = {}) {
  let presetKey = initial;
  let from = null, to = null;

  const el = document.createElement('div');
  el.className = 'space-y-2';
  el.innerHTML = `
    <div class="flex flex-wrap gap-2" data-presets>
      ${PRESETS.map((p) => `
        <button type="button" data-preset="${p.key}"
                class="text-xs px-3 py-1.5 rounded-full transition"
                style="border:1px solid var(--color-border); background:var(--color-surface)">
          ${p.label}
        </button>
      `).join('')}
    </div>
    <div data-custom class="hidden flex items-center gap-2">
      <input type="date" data-from class="input text-sm" />
      <span class="muted text-xs">to</span>
      <input type="date" data-to class="input text-sm" />
    </div>
  `;

  const presetsEl = el.querySelector('[data-presets]');
  const customEl  = el.querySelector('[data-custom]');
  const fromEl    = el.querySelector('[data-from]');
  const toEl      = el.querySelector('[data-to]');

  function paint() {
    presetsEl.querySelectorAll('[data-preset]').forEach((b) => {
      const active = b.dataset.preset === presetKey;
      b.style.background = active ? 'var(--color-primary)' : 'var(--color-surface)';
      b.style.color = active ? '#fff' : 'var(--color-text)';
      b.style.borderColor = active ? 'var(--color-primary)' : 'var(--color-border)';
    });
    customEl.classList.toggle('hidden', presetKey !== 'custom');
  }

  function emit() {
    const label = PRESETS.find((p) => p.key === presetKey)?.label || '';
    onChange({ from, to, presetKey, label });
  }

  function applyPreset(key) {
    presetKey = key;
    const preset = PRESETS.find((p) => p.key === key);
    const now = new Date();
    if (preset.custom) {
      // Don't auto-fire — wait for user to pick dates.
      paint();
      return;
    }
    if (key === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0);
      const end   = new Date(now); end.setHours(23,59,59,999);
      from = start.toISOString();
      to = end.toISOString();
    } else if (key === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now);
      from = start.toISOString();
      to = end.toISOString();
    } else {
      const start = new Date(now);
      start.setDate(start.getDate() - preset.days);
      start.setHours(0,0,0,0);
      from = start.toISOString();
      to = now.toISOString();
    }
    paint();
    emit();
  }

  presetsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    applyPreset(btn.dataset.preset);
  });

  function applyCustom() {
    if (!fromEl.value || !toEl.value) return;
    const start = new Date(fromEl.value); start.setHours(0,0,0,0);
    const end   = new Date(toEl.value);   end.setHours(23,59,59,999);
    if (end < start) return;
    from = start.toISOString();
    to = end.toISOString();
    emit();
  }
  fromEl.addEventListener('change', applyCustom);
  toEl.addEventListener('change', applyCustom);

  // If caller seeded explicit dates, use them and select Custom.
  if (initialFrom && initialTo) {
    presetKey = 'custom';
    from = initialFrom;
    to = initialTo;
    fromEl.value = initialFrom.slice(0, 10);
    toEl.value   = initialTo.slice(0, 10);
    paint();
    emit();
  } else {
    applyPreset(initial);
  }

  return {
    el,
    getValue: () => ({ from, to, presetKey }),
  };
}
