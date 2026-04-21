/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eaf9f6",
          100: "#d0f1eb",
          200: "#a7e4db",
          300: "#76d4ca",
          400: "#37c7a4",
          500: "#06a89d",
          600: "#038f88",
          700: "#04586b",
          800: "#174358",
          900: "#133d51",
          950: "#0b2734"
        },
        ink: {
          900: "#0f1f28",
          800: "#17313e",
          700: "#274554",
          600: "#4a6570",
          500: "#67818b"
        }
      },
      fontFamily: {
        sans: ["Avenir Next", "Segoe UI", "Trebuchet MS", "sans-serif"]
      },
      fontSize: {
        display: ["2rem", { lineHeight: "2.3rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        title: ["1.5rem", { lineHeight: "1.9rem", letterSpacing: "-0.01em", fontWeight: "700" }],
        body: ["0.95rem", { lineHeight: "1.4rem" }]
      },
      borderRadius: {
        card: "1rem",
        control: "0.75rem"
      },
      boxShadow: {
        card: "0 18px 44px rgba(19, 61, 81, 0.14)"
      }
    }
  },
  plugins: []
};
