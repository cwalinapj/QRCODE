import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f8f5",
          500: "#0f6b4a",
          700: "#0b5138"
        }
      }
    }
  },
  plugins: []
} satisfies Config;
