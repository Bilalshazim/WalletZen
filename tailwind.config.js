/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // ThemeContext always stamps the resolved theme ("light" | "dark") on <html data-theme>.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme tokens (defined in index.css): `ink` is foreground, `surface` is solid panels.
        ink: 'rgb(var(--ink) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        zen: {
          950: '#050C08',
          900: '#0A1A12',
          800: '#0D2218',
          navy: '#0D1C3B',
          lime: '#84CC16',
          emerald: '#10B981',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        // Editorial serif for headings and money figures; the sans stays on UI text.
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-8px)' },
          '40%, 80%': { transform: 'translateX(8px)' },
        },
        'sheet-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        shake: 'shake 350ms ease-in-out',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
