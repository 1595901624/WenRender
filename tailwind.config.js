/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18201b",
        moss: {
          50: "#f3f8f4",
          100: "#e3f0e7",
          500: "#3c9563",
          600: "#2f7d51",
          700: "#276643",
        },
      },
      boxShadow: {
        soft: "0 16px 40px rgba(23, 45, 31, 0.08)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "\"Segoe UI\"", "\"PingFang SC\"", "\"Microsoft YaHei\"", "sans-serif"],
        mono: ["Consolas", "\"SFMono-Regular\"", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
