import type { Config } from "tailwindcss";

// Sistema de diseño "Horno":
//   masa     → fondos (cremas de masa cruda)
//   corteza  → texto (marrones de pan horneado)
//   horno    → único acento (acciones primarias, foco)
//   cuadre   → reservado para estados de caja: ok (cuadra) / mal (descuadre)
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        masa: {
          50: "#fbf8f3",
          100: "#f4eee3",
          200: "#e8dcc8",
        },
        corteza: {
          400: "#9c8772",
          600: "#6b563f",
          800: "#40301f",
          900: "#271c14",
        },
        horno: {
          400: "#d9772e",
          500: "#c75f1a",
          600: "#a64c12",
        },
        cuadre: {
          ok: "#2e7d4f",
          mal: "#b3362b",
        },
        // madrugada: azul frío para diferenciar la sucursal Consejo del naranja de horno
        madrugada: {
          100: "#dde8f5",
          500: "#2d6fa8",
          600: "#235994",
        },
      },
      borderRadius: {
        panel: "1rem",
      },
      fontSize: {
        // Texto de botones táctiles: grande y firme para el celular del mostrador
        "touch-lg": ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};
export default config;
