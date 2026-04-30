/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,html}'],
  theme: {
    extend: {
      colors: {
        // Brand (theme-driven)
        primary:         'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-soft':  'var(--color-primary-soft)',
        secondary:       'var(--color-secondary)',
        accent:          'var(--color-accent)',
        // Surfaces (theme-driven)
        bg:      'var(--color-bg)',
        surface: 'var(--color-surface)',
        border:  'var(--color-border)',
        // Text (theme-driven)
        text:  'var(--color-text)',
        muted: 'var(--color-muted)',
      },
      fontFamily: { brand: 'var(--font-family)' },
      borderRadius: {
        sm:    'var(--radius-sm)',
        DEFAULT:'var(--radius-md)',
        md:    'var(--radius-md)',
        lg:    'var(--radius-lg)',
        xl:    'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full:  '9999px',
      },
      boxShadow: {
        sm:     'var(--shadow-sm)',
        DEFAULT:'var(--shadow-md)',
        md:     'var(--shadow-md)',
        lg:     'var(--shadow-lg)',
        none:   'none',
      },
      maxWidth: { container: 'var(--container-max)' },
    },
  },
  plugins: [],
};
