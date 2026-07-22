import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Green palette from the reference design
          lime: "#56EF02",
          lime2: "#51CD0C",
          green: "#139600",
          ink: "#111111",
          ink2: "#1A1A1A",
        },
        status: {
          new: "#f5a623",      // Нова — помаранчевий
          confirmed: "#3cba54", // Підтверджена — зелений
          prepaid: "#3b82f6",   // Аванс — синій
          cancelled: "#9ca3af", // Скасована — сірий
        },
      },
      fontFamily: {
        sans: ['"Open Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
