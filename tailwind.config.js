/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        surface: 'var(--surface)',
        surfaceAlt: 'var(--surface-alt)',
        gold: 'var(--gold)',
        goldMuted: 'var(--gold-muted)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        border: 'var(--border)',
      },
      fontFamily: {
        serif: ['PlayfairDisplay_400Regular', 'serif'],
        sans: ['Inter_400Regular', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
