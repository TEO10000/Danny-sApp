"use client";

import { useEffect } from "react";

export function RegistrarSW() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Fallo silencioso: la app funciona igual sin SW
      });
    }
  }, []);

  return null;
}
