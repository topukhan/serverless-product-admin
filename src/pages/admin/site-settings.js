import { supabase } from '../../services/supabase.js';
import { getFlags, _setCachedFlags } from '../../services/branding.js';
import { showToast } from '../../components/toast.js';
import { escapeHtml } from '../../lib/dom.js';

// Schema for the toggles rendered on this page. Add a new entry here when
// you add a new flag (also update DEFAULT_FLAGS in branding.js + the
// migration so the column has the key on existing rows).
const FLAG_SCHEMA = [
  {
    key: 'show_stock',
    title: 'Show exact stock quantity on the public site',
    description:
      'When ON, customers see numbers like "30 in stock" and "Only 3 left". ' +
      'When OFF, they only see "In stock" / "Low stock" without the count. ' +
      '"Sold out" always shows in both modes.',
  },
  {
    key: 'show_sold',
    title: 'Show "sold" counter on the public site',
    description:
      'When ON, the sold count entered in each product (e.g. "120 sold") ' +
      'appears on product cards and detail pages. When OFF it stays hidden. ' +
      'Products with a sold count of 0 never display this regardless.',
  },
];

export async function AdminSiteSettings() {
  const root = document.createElement('section');
  root.className = 'p-6 sm:p-8 max-w-2xl';

  const flags = getFlags();

  root.innerHTML = `
    <header class="mb-6">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Site settings</h1>
      <p class="muted text-sm mt-1">
        Feature flags that change how the public site behaves. Saved instantly.
      </p>
    </header>
    <div data-list class="space-y-3"></div>
  `;
  const list = root.querySelector('[data-list]');

  for (const flag of FLAG_SCHEMA) {
    list.appendChild(toggleRow(flag, !!flags[flag.key]));
  }

  return root;
}

function toggleRow(flag, initial) {
  const row = document.createElement('div');
  row.className = 'card p-5 flex items-start gap-4';

  row.innerHTML = `
    <div class="flex-1 min-w-0">
      <div class="font-medium">${escapeHtml(flag.title)}</div>
      <p class="text-sm muted mt-1 leading-relaxed">${escapeHtml(flag.description)}</p>
    </div>
    <label class="relative inline-flex shrink-0 cursor-pointer">
      <input data-toggle type="checkbox" class="sr-only peer" ${initial ? 'checked' : ''}>
      <span class="block w-11 h-6 rounded-full transition"
            style="background: var(--color-border)"></span>
      <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition"></span>
    </label>
  `;

  // Switch styling — paint the track + dot based on state.
  const cb = row.querySelector('[data-toggle]');
  const track = row.querySelector('label > span:first-of-type');
  const dot = row.querySelector('label > span:last-of-type');
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

  let inFlight = false;
  cb.addEventListener('change', async () => {
    if (inFlight) return;
    inFlight = true;
    paint();
    cb.disabled = true;

    const desired = cb.checked;
    try {
      // jsonb_set-style merge so other flags aren't disturbed.
      const { data, error } = await supabase
        .from('settings')
        .update({ flags: { ...getFlags(), [flag.key]: desired } })
        .eq('id', 1)
        .select('flags')
        .single();
      if (error) throw error;
      _setCachedFlags(data.flags || {});
      showToast(desired ? 'Turned on' : 'Turned off', { variant: 'success' });
    } catch (err) {
      cb.checked = !desired;
      paint();
      showToast(err.message || 'Could not save', { variant: 'error' });
    } finally {
      cb.disabled = false;
      inFlight = false;
    }
  });

  return row;
}
