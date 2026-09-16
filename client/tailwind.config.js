/**
 * Every themed colour resolves through a CSS variable holding an `R G B` triplet, so the
 * same utility class (`text-ink-900`, `bg-surface`) means "primary text" / "card surface"
 * in both themes and the palette swaps in one place — `styles/index.css`. The triplet form
 * is what keeps Tailwind's opacity modifiers (`bg-surface/80`) working.
 *
 * Tailwind's built-in `slate` and `indigo` ramps are the *literal* values behind `ink` and
 * `brand`. Use those directly for surfaces that must stay dark in both themes — overlay
 * scrims, the hero, the auth panel — so they don't invert along with the theme.
 */
const themed = (name) => ({
  50: `rgb(var(--color-${name}-50) / <alpha-value>)`,
  100: `rgb(var(--color-${name}-100) / <alpha-value>)`,
  200: `rgb(var(--color-${name}-200) / <alpha-value>)`,
  300: `rgb(var(--color-${name}-300) / <alpha-value>)`,
  400: `rgb(var(--color-${name}-400) / <alpha-value>)`,
  500: `rgb(var(--color-${name}-500) / <alpha-value>)`,
  600: `rgb(var(--color-${name}-600) / <alpha-value>)`,
  700: `rgb(var(--color-${name}-700) / <alpha-value>)`,
  800: `rgb(var(--color-${name}-800) / <alpha-value>)`,
  900: `rgb(var(--color-${name}-900) / <alpha-value>)`,
  950: `rgb(var(--color-${name}-950) / <alpha-value>)`,
});

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Class strategy, not `media`: the toggle has to be able to override the OS preference.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Single accent ramp. Everything else is neutral, which is what keeps a
        // commercial storefront looking calm rather than like a component gallery.
        brand: themed('brand'),
        ink: themed('ink'),
        success: {
          50: 'rgb(var(--color-success-50) / <alpha-value>)',
          500: 'rgb(var(--color-success-500) / <alpha-value>)',
          600: 'rgb(var(--color-success-600) / <alpha-value>)',
          700: 'rgb(var(--color-success-700) / <alpha-value>)',
        },
        warning: {
          50: 'rgb(var(--color-warning-50) / <alpha-value>)',
          500: 'rgb(var(--color-warning-500) / <alpha-value>)',
          600: 'rgb(var(--color-warning-600) / <alpha-value>)',
          700: 'rgb(var(--color-warning-700) / <alpha-value>)',
          800: 'rgb(var(--color-warning-800) / <alpha-value>)',
        },
        danger: {
          50: 'rgb(var(--color-danger-50) / <alpha-value>)',
          500: 'rgb(var(--color-danger-500) / <alpha-value>)',
          600: 'rgb(var(--color-danger-600) / <alpha-value>)',
          700: 'rgb(var(--color-danger-700) / <alpha-value>)',
          800: 'rgb(var(--color-danger-800) / <alpha-value>)',
        },

        /** Page background. Sits *behind* `surface` and is the darker of the two in dark mode. */
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        /** Cards, headers, inputs, menus — anything raised off the canvas. */
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        /** Popovers and drawers: one step further off the canvas again. */
        'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
      },
      // A hard-coded white ring offset would draw a bright halo around every focused
      // control in dark mode; follow the canvas instead.
      ringOffsetColor: {
        DEFAULT: 'rgb(var(--color-canvas))',
        canvas: 'rgb(var(--color-canvas))',
        surface: 'rgb(var(--color-surface))',
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        // Slightly tighter tracking on display sizes — large text set at default
        // tracking reads loose and amateurish.
        'display-lg': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
        display: ['2.75rem', { lineHeight: '1.1', letterSpacing: '-0.025em', fontWeight: '700' }],
        'heading-lg': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '650' }],
        heading: ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '650' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Themed: elevation on a dark canvas needs far more opacity to read at all,
        // so the alpha lives in the variable rather than being hard-coded here.
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        popover: 'var(--shadow-popover)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(-12px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toast-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
