/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        museum: {
          black: "#0D0D0D",
          parchment: "#F5F2EB",
          gold: "#C5A059",
          terracotta: "#8B4513",
          emerald: "#1B3B2B",
        },
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        serif: ["Cormorant Garamond", "serif"],
        sans: ['"Plus Jakarta Sans"', "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.35em",
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(197,160,89,0.35), 0 12px 40px -12px rgba(0,0,0,0.8)",
        glow: "0 0 24px rgba(197,160,89,0.25)",
      },
      backgroundImage: {
        "museum-radial":
          "radial-gradient(1200px 600px at 50% -10%, rgba(197,160,89,0.10), transparent 60%), radial-gradient(800px 400px at 85% 110%, rgba(139,69,19,0.12), transparent 60%)",
      },
      animation: {
        "pulse-gold": "pulseGold 3s ease-in-out infinite",
      },
      keyframes: {
        pulseGold: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
