// Star rating display + interactive picker. Both use the brand accent color
// so admin can recolor them via the `accent_color` setting.

const FILLED = '★';
const EMPTY  = '☆';

export function StarsDisplay(rating, { size = 'sm' } = {}) {
  const r = Math.round(Number(rating) || 0);
  const el = document.createElement('span');
  el.className =
    'inline-flex items-center gap-0.5 leading-none ' +
    (size === 'lg' ? 'text-xl' : 'text-sm');
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = i <= r ? FILLED : EMPTY;
    s.style.color = i <= r ? 'var(--color-accent)' : '#cbd5e1';
    el.appendChild(s);
  }
  return el;
}

export function StarsInput({ initial = 0 } = {}) {
  let value = initial;
  let hover = null;

  const wrap = document.createElement('div');
  wrap.className = 'inline-flex items-center gap-1';

  const buttons = [];
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-2xl leading-none transition-transform hover:scale-110';
    b.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    b.addEventListener('click',     () => { value = i; paint(); });
    b.addEventListener('mouseenter', () => { hover = i; paint(); });
    b.addEventListener('mouseleave', () => { hover = null; paint(); });
    buttons.push(b);
    wrap.appendChild(b);
  }

  function paint() {
    const active = hover ?? value;
    buttons.forEach((b, idx) => {
      const filled = idx + 1 <= active;
      b.textContent = filled ? FILLED : EMPTY;
      b.style.color = filled ? 'var(--color-accent)' : '#cbd5e1';
    });
  }
  paint();

  return {
    el: wrap,
    getValue: () => value,
    setValue: (v) => { value = v; paint(); },
  };
}
