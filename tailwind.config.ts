import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6C5CE7",
          dark: "#5B4BD6",
          light: "#A29BFE",
          soft: "#EEF0FF",
        },
        ink: {
          DEFAULT: "#1E2028",
          muted: "#6B7080",
        },
      },
      borderRadius: {
        xl2: "18px",
      },
    },
  },
  plugins: [],
};

export default config;
