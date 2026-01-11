/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        secondary: '#475569',
        tertiary: '#94a3b8',
        brand: '#0f172a',
        brandHover: '#1e293b',
        brandDark: '#334155',
        accent: '#d4ff00',
        accentText: '#1a2e05',
        accentDark: '#a8cc00',
        surface: '#ffffff',
        border: '#e2e8f0',
      },
      borderRadius: {
        'brand': '24px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        float: '0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
      },
      padding: {
        'safe': 'max(1.25rem, env(safe-area-inset-bottom))',
      },
    },
  },
  plugins: [],
};
