import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        perkin: {
          navy: "#071a2f",
          navy2: "#0c2948",
          blue: "#073766",
          orange: "#f56a22",
          orangeHover: "#e05612",
          orangeSoft: "#fff1e8",
          cream: "#f5f6f8",
          ink: "#102238",
          muted: "#526275",
          subtle: "#6e7e91",
          line: "#dce2e8",
          lineStrong: "#c5cfd9",
          emerald: "#0d7a5f",
          emeraldSoft: "#e6f5f0",
          amber: "#b45309",
          amberSoft: "#fef3c7",
          crimson: "#c9252d",
          crimsonSoft: "#fdecec",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Manrope"', "system-ui", "sans-serif"],
        display: ['"Manrope"', '"IBM Plex Sans Thai"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
