import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf7",
          100: "#dcfcec",
          200: "#bbf7d8",
          300: "#86efbc",
          400: "#4ade93",
          500: "#22c068",
          600: "#16a34a",
          700: "#0f6b4a",
          800: "#0b5138",
          900: "#052e1e",
        }
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg, #052e1e 0%, #0f6b4a 50%, #16a34a 100%)",
        "card-gradient": "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,253,247,0.9) 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "card": "0 4px 24px -4px rgba(15,107,74,0.12), 0 1px 4px -1px rgba(0,0,0,0.06)",
        "card-hover": "0 8px 32px -4px rgba(15,107,74,0.2), 0 2px 8px -2px rgba(0,0,0,0.08)",
        "btn": "0 2px 8px -2px rgba(15,107,74,0.4)",
      },
    }
  },
  plugins: []
} satisfies Config;
