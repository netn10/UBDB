/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Grounds & panels — warm card-stock cream (light) / frame black (dark).
        cardstock: "#E9E1CE",
        frame: "#14110C",
        surface: { DEFAULT: "#F3EEE0", dark: "#221C13" },
        ink: { DEFAULT: "#1B160E", dark: "#E7DFCB" },
        // Accent — MTG gold / multicolor legendary frame.
        gold: { DEFAULT: "#C9A227", dark: "#D8B23A" },
        // Mana pips — identity only, never chrome. Mirrors src/lib/colors.ts
        // MANA_HEX (kept in sync by hand). `mana.r` doubles as danger/error.
        mana: {
          w: "#F8F2D8",
          u: "#3A7DC4",
          b: "#4A4A52",
          r: "#C6483E",
          g: "#4E8C5B",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        // Real MTG card corner radius is ~3.5% of width; subtler than rounded-xl.
        card: "0.375rem",
      },
    },
  },
  plugins: [],
};
