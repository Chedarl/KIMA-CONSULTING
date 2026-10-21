import type { Config } from "tailwindcss";

/**
 * Tokens mirror blueprint section 9 and
 * docs/foundation/design-system.md. Every colour is a CSS variable so light and
 * dark themes swap without touching component code.
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-sunken": "rgb(var(--surface-sunken) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        "fg-muted": "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-subtle": "rgb(var(--fg-subtle) / <alpha-value>)",
        navy: {
          DEFAULT: "rgb(var(--navy) / <alpha-value>)",
          strong: "rgb(var(--navy-strong) / <alpha-value>)",
          soft: "rgb(var(--navy-soft) / <alpha-value>)",
        },
        teal: {
          DEFAULT: "rgb(var(--teal) / <alpha-value>)",
          text: "rgb(var(--teal-text) / <alpha-value>)",
          soft: "rgb(var(--teal-soft) / <alpha-value>)",
        },
        amber: {
          DEFAULT: "rgb(var(--amber) / <alpha-value>)",
          text: "rgb(var(--amber-text) / <alpha-value>)",
          soft: "rgb(var(--amber-soft) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          text: "rgb(var(--danger-text) / <alpha-value>)",
          soft: "rgb(var(--danger-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgb(20 34 53 / 0.04), 0 1px 3px rgb(20 34 53 / 0.06)",
        raised: "0 4px 12px rgb(20 34 53 / 0.08)",
      },
      spacing: {
        row: "2.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
