import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E2621F",
          dark: "#B84B15",
          light: "#F3A467",
          soft: "#FBE7D0",
        },
        ink: {
          DEFAULT: "#2A2118",
          muted: "#8A7A5C",
        },
        // Palette "écru" : remplace les gris froids (slate) et le blanc pur
        // par des tons chauds et un fond parcheminé.
        paper: "#F5EBD8",
        surface: "#FFFCF5",
        sand: "#F0E4C8",
        line: "#E4D3AC",
        "line-soft": "#EFE4CB",
      },
      borderRadius: {
        xl2: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
