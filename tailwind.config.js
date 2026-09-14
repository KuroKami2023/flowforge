/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Molten-amber accent — the "heat" of the forge.
        forge: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f'
        },
        // Near-black control-room chrome (#111418 family).
        ink: {
          50: '#f4f6f8',
          100: '#e9edf1',
          200: '#d7dde4',
          300: '#b8c1cd',
          400: '#8a97a8',
          500: '#5b6878',
          600: '#3d4754',
          700: '#2e3641',
          800: '#232a33',
          900: '#1a1f26',
          950: '#111418'
        },
        // Warm light canvas for content areas.
        paper: {
          DEFAULT: '#f4f5f3',
          dark: '#e9ebe7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px rgba(17, 20, 24, 0.06), 0 4px 14px -4px rgba(17, 20, 24, 0.10)',
        'card-hover': '0 2px 4px rgba(17, 20, 24, 0.08), 0 10px 24px -8px rgba(17, 20, 24, 0.18)',
        forge: '0 0 0 3px rgba(245, 158, 11, 0.35)'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.4s linear infinite'
      }
    }
  },
  plugins: []
};
