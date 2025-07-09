/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f2f9',
          100: '#cce5f3',
          200: '#99cbe7',
          300: '#66b1db',
          400: '#3397cf',
          500: '#2D8BBA', // primary
          600: '#246f95',
          700: '#1b5370',
          800: '#12374a',
          900: '#091c25',
        },
        secondary: {
          50: '#eafaf9',
          100: '#d5f6f3',
          200: '#abede7',
          300: '#82e4db',
          400: '#58dbcf',
          500: '#4ECDC4', // secondary
          600: '#27aca3',
          700: '#1d817a',
          800: '#145650',
          900: '#0a2b28',
        },
        accent: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444', // accent
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};