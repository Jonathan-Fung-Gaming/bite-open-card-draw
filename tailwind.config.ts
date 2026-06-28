import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./docs/**/*.md"],
  theme: {
    extend: {
      colors: {
        ember: {
          50: "#fff4e6",
          300: "#ffb95c",
          500: "#ff7a1a",
          700: "#c94313",
          900: "#4f170d",
        },
        furnace: {
          950: "#080706",
          900: "#11100f",
          800: "#1b1916",
          700: "#2b2521",
        },
        metal: {
          300: "#c0bab0",
          500: "#777169",
          700: "#3a3732",
          850: "#20201e",
        },
      },
      boxShadow: {
        ember: "0 0 24px rgba(255, 92, 24, 0.24)",
        "ember-tight": "0 0 12px rgba(255, 122, 26, 0.35)",
      },
      fontFamily: {
        display: ["var(--font-geist-sans)", "Arial", "sans-serif"],
        body: ["var(--font-geist-sans)", "Arial", "sans-serif"],
      },
      backgroundImage: {
        "steel-lines":
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 12px), linear-gradient(180deg, rgba(255,122,26,0.08), transparent 36%)",
      },
    },
  },
  plugins: [],
};

export default config;
