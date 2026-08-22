import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1f2937",
          900: "#111827",
          950: "#0d1117",
        },
        sand: {
          50: "#fbfaf7",
          100: "#f4efe6",
          200: "#e8dcc8",
          300: "#d9c7a8",
        },
        moss: {
          400: "#5aa469",
          500: "#2f855a",
        },
        ember: {
          400: "#f59e0b",
          500: "#d97706",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(90, 164, 105, 0.15), 0 20px 45px rgba(15, 23, 42, 0.18)",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeInUp: "fadeInUp 0.5s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
