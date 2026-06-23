/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
      },
      colors: {
        maroon: {
          50: '#fbeef2',
          100: '#f5d6df',
          500: '#8a1c3b',
          600: '#7a1733',
          700: '#63122a',
          800: '#4f0f22',
        },
        brand: {
          50: '#fbf7ef',
          100: '#f4e9d2',
          200: '#e8d0a3',
          300: '#d9b16d',
          400: '#cd9748',
          500: '#bd8035',
          600: '#a3672c',
          700: '#824e26',
          800: '#6c4025',
          900: '#5c3722',
        },
      },
    },
  },
  plugins: [],
};
