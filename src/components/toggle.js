// Small switch component, used wherever an enable/disable boolean is
// shown to the admin. The onChange callback can be async; if it throws,
// the switch reverts and the error is re-thrown so the caller can toast.
export function Toggle({
  initial = false,
  onChange = async () => {},
  ariaLabel = 'Toggle',
} = {}) {
  const label = document.createElement('label');
  label.className = 'relative inline-flex shrink-0 cursor-pointer';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'sr-only';
  input.checked = !!initial;
  input.setAttribute('aria-label', ariaLabel);

  const track = document.createElement('span');
  track.className = 'block w-11 h-6 rounded-full transition';

  const dot = document.createElement('span');
  dot.className = 'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition';

  label.append(input, track, dot);

  function paint() {
    if (input.checked) {
      track.style.background = 'var(--color-primary)';
      dot.style.transform = 'translateX(20px)';
    } else {
      track.style.background = 'var(--color-border)';
      dot.style.transform = 'translateX(0)';
    }
  }
  paint();

  let inFlight = false;
  input.addEventListener('change', async () => {
    if (inFlight) return;
    inFlight = true;
    paint();
    input.disabled = true;
    const next = input.checked;
    try {
      await onChange(next);
    } catch (err) {
      input.checked = !next;
      paint();
      throw err;
    } finally {
      input.disabled = false;
      inFlight = false;
    }
  });

  return {
    el: label,
    setChecked(b) { input.checked = !!b; paint(); },
    getChecked() { return input.checked; },
  };
}
