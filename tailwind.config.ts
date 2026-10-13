import type { Config } from "tailwindcss";

const token = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: token("ink"), 2: token("ink-2"), 3: token("ink-3"), line: token("ink-line") },
        canvas: token("canvas"),
        surface: token("surface"),
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        muted: token("muted"),
        brand: { DEFAULT: token("brand"), strong: token("brand-strong"), soft: token("brand-soft") },
        glow: token("glow"),
        lime: { DEFAULT: token("lime"), ink: token("lime-ink") },
        success: token("success"),
        warning: token("warning"),
        danger: token("danger"),
        info: token("info"),
        violet: token("violet"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
