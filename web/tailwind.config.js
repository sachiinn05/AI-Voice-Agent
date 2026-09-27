/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07090c",
        panel: "#10151c",
        panel2: "#141b24",
        line: "#243041",
        ink: "#eef3f7",
        muted: "#8b9aab",
        brand: "#3ee08f",
        danger: "#ff4d6a",
        speak: "#5ad0ff",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
