/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F5F0FF',
          100: '#EDE5FF',
          200: '#D4C4FF',
          300: '#B89EFF',
          400: '#9B73FF',
          500: '#8652FF',
          600: '#7040E6',
          700: '#5A30CC',
          800: '#4423A6',
          900: '#2F1880',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
