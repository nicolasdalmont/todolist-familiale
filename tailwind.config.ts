import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Thème « Checkberry » (04/09/2026) : accent rose framboise sur fond
        // blanc. Remplace l'ancien accent orange sur fond écru.
        brand: {
          DEFAULT: "#D6336C",
          dark: "#A12552",
          light: "#F06595",
          soft: "#FBE0EA",
        },
        ink: {
          DEFAULT: "#241A20",
          muted: "#867A80",
        },
        // Fond blanc + neutres très légèrement teintés rose/gris (pas de
        // gris froid) pour rester cohérents avec l'accent framboise.
        paper: "#FFFFFF",
        surface: "#FFFFFF",
        sand: "#F5ECF0",
        line: "#E9DEE4",
        "line-soft": "#F3ECEF",
      },
      borderRadius: {
        xl2: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
