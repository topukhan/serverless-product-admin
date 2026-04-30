import { uploadProductImage } from '../services/admin-products.js';
import { showToast } from './toast.js';

// Self-contained image input. Two ways to provide an image:
//   1) Click the dropzone to upload a file (goes to Supabase Storage)
//   2) Paste a URL — supports external links (no storage involved)
//
//   const u = ImageUploader({ initialUrl, label: 'Thumbnail' });
//   u.el            -> mount this DOM node in the form
//   u.getValue()    -> current url string ('' if empty)
//   u.setValue(url) -> programmatic set
//
// Pass `upload` to swap the storage target (defaults to product images).
export function ImageUploader({
  initialUrl = '',
  label = 'Image',
  size = 'md',
  upload = uploadProductImage,
  onChange = null,
} = {}) {
  let value = initialUrl || '';

  const wrap = document.createElement('div');
  wrap.className = 'space-y-2';

  const labelEl = document.createElement('div');
  labelEl.className = 'label';
  labelEl.textContent = label;
  wrap.appendChild(labelEl);

  const slot = document.createElement('div');
  slot.className = 'relative rounded-lg overflow-hidden';
  slot.style.background = 'var(--color-bg)';
  slot.style.border = '1px dashed var(--color-border)';
  slot.style.aspectRatio = '1 / 1';
  slot.style.maxWidth = size === 'sm' ? '180px' : 'none';
  wrap.appendChild(slot);

  // Hidden file input. Uses sr-only (visually hidden but still in the layout)
  // because some mobile browsers — notably older Android Chrome — refuse to
  // open the picker when .click() is invoked on a `display:none` input.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'sr-only';
  wrap.appendChild(fileInput);

  // URL paste field.
  const urlRow = document.createElement('div');
  urlRow.className = 'flex items-center gap-2';
  urlRow.innerHTML = `
    <input data-url type="url" placeholder="…or paste an image URL" class="input text-xs" />
  `;
  wrap.appendChild(urlRow);

  const urlInput = urlRow.querySelector('[data-url]');

  function paint() {
    if (value) {
      slot.style.borderStyle = 'solid';
      slot.innerHTML = `
        <img src="${value}" alt="" class="w-full h-full object-cover" />
        <div class="absolute inset-x-0 bottom-0 p-2 flex items-center gap-2"
             style="background: linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)">
          <button type="button" data-replace
                  class="text-xs px-2 py-1 rounded bg-white/90 text-[color:var(--color-text)] hover:bg-white">
            Replace
          </button>
          <button type="button" data-clear
                  class="text-xs px-2 py-1 rounded text-white"
                  style="background: rgb(220 38 38 / 0.9)">
            Remove
          </button>
        </div>
      `;
      slot.querySelector('[data-replace]').addEventListener('click', () => fileInput.click());
      slot.querySelector('[data-clear]').addEventListener('click', () => {
        value = '';
        urlInput.value = '';
        paint();
        onChange?.(value);
      });
    } else {
      slot.style.borderStyle = 'dashed';
      slot.innerHTML = `
        <button type="button" data-pick
                class="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 text-sm muted hover:bg-[color:var(--color-primary-soft)] transition">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="font-medium">Click to upload</span>
          <span class="text-xs">PNG / JPG / WebP up to a few MB</span>
        </button>
      `;
      slot.querySelector('[data-pick]').addEventListener('click', () => fileInput.click());
    }
  }

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    fileInput.value = '';
    await doUpload(file);
  });

  urlInput.addEventListener('change', () => {
    const url = urlInput.value.trim();
    if (url) {
      value = url;
      paint();
      onChange?.(value);
    }
  });

  async function doUpload(file) {
    showBusy(true);
    try {
      const { url } = await upload(file);
      value = url;
      urlInput.value = '';
      paint();
      onChange?.(value);
    } catch (err) {
      showToast(err.message || 'Upload failed', { variant: 'error' });
    } finally {
      showBusy(false);
    }
  }

  function showBusy(b) {
    if (b) {
      slot.innerHTML = `
        <div class="absolute inset-0 flex items-center justify-center muted text-sm">
          <span class="inline-block w-4 h-4 mr-2 rounded-full border-2 border-current border-t-transparent animate-spin"></span>
          Uploading…
        </div>`;
    } else {
      paint();
    }
  }

  paint();

  return {
    el: wrap,
    getValue: () => value,
    setValue: (v) => { value = v || ''; paint(); },
  };
}
