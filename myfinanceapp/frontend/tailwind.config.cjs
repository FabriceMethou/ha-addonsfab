/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary colors
        primary: {
          DEFAULT: '#3b82f6',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Success colors
        success: {
          DEFAULT: '#10b981',
          light: 'rgba(16, 185, 129, 0.2)',
          dark: '#047857',
        },
        // Error colors
        error: {
          DEFAULT: '#ef4444',
          light: 'rgba(239, 68, 68, 0.2)',
          dark: '#b91c1c',
        },
        // Warning colors
        warning: {
          DEFAULT: '#f59e0b',
          light: 'rgba(245, 158, 11, 0.2)',
          dark: '#b45309',
        },
        // Info colors
        info: {
          DEFAULT: '#06b6d4',
          light: 'rgba(6, 182, 212, 0.2)',
          dark: '#0891b2',
        },
        // Background colors (matching existing glass theme)
        background: {
          DEFAULT: '#040617',
          paper: '#071022',
          elevated: '#0f172a',
        },
        // Surface colors for cards
        surface: {
          DEFAULT: 'rgba(255, 255, 255, 0.04)',
          hover: 'rgba(255, 255, 255, 0.08)',
          border: 'rgba(255, 255, 255, 0.06)',
        },
        // Text colors
        foreground: {
          DEFAULT: '#e6eef8',
          muted: '#9fb0c8',
          subtle: '#64748b',
        },
        // Border colors
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          strong: 'rgba(255, 255, 255, 0.12)',
        },
        // Input colors
        input: 'rgba(255, 255, 255, 0.1)',
        ring: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
      boxShadow: {
        'glass': '0 8px 30px rgba(2, 6, 23, 0.6)',
        'glass-sm': '0 4px 15px rgba(2, 6, 23, 0.4)',
        'glow-primary': '0 0 20px rgba(59, 130, 246, 0.3)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.3)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 380ms ease both',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
