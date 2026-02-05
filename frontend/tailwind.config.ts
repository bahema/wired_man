/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--bg)",
          accent: "var(--bg-accent)"
        },
        panel: {
          DEFAULT: "var(--panel)",
          elevated: "var(--panel-elevated)"
        },
        text: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)"
        },
        border: {
          subtle: "var(--border)"
        },
        primary: {
          600: "#2563eb",
          700: "#1d4ed8"
        }
      },
      boxShadow: {
        premium: "0 12px 24px -10px rgba(15, 23, 42, 0.25), 0 2px 8px -4px rgba(15, 23, 42, 0.18)",
        focus: "0 16px 30px -12px rgba(15, 23, 42, 0.32), 0 4px 10px -6px rgba(15, 23, 42, 0.2)"
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #eff6ff 0%, #ffffff 45%, #eef2ff 100%)",
        "eye-comfort": "radial-gradient(circle at 12% 10%, rgba(37, 99, 235, 0.08), transparent 35%), radial-gradient(circle at 88% 18%, rgba(14, 116, 144, 0.08), transparent 40%), linear-gradient(150deg, var(--bg) 0%, var(--bg-accent) 52%, var(--bg) 100%)"
      }
    }
  },
  plugins: []
};
