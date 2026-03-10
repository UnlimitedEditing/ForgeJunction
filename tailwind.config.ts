import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './launcher.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic surface tokens — driven by CSS custom properties
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised:  'rgb(var(--surface-raised) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
        },
        // Panel (sidebar / column background)
        panel: 'rgb(var(--panel) / <alpha-value>)',
        // Brand accent — changes per theme (ember in industrial, purple in discord, brass in pirate)
        brand: 'rgb(var(--brand) / <alpha-value>)',
        // Secondary brand hover variant
        ember2: 'rgb(var(--ember2) / <alpha-value>)',
        // Arc accent — info, params, links
        arc:  'rgb(var(--arc)  / <alpha-value>)',
        arc2: 'rgb(var(--arc2) / <alpha-value>)',
        // Muted text
        muted: 'rgb(var(--muted) / <alpha-value>)',
        // Dim (very muted — borders, separators)
        dim: 'rgb(var(--dim) / <alpha-value>)',
        // Override Tailwind's built-in "white" so text-white/40, border-white/10 etc. theme automatically
        white: 'rgb(var(--foreground) / <alpha-value>)',
        // Override neutral shades used across components
        neutral: {
          950: 'rgb(var(--n950) / <alpha-value>)',
          900: 'rgb(var(--n900) / <alpha-value>)',
          800: 'rgb(var(--n800) / <alpha-value>)',
          700: 'rgb(var(--n700) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans:  ['Syne', 'system-ui', 'sans-serif'],
        mono:  ['DM Mono', 'monospace'],
        bebas: ['Bebas Neue', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
