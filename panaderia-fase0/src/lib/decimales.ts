import { z } from "zod";

/**
 * Convierte un string con formato de número a float, soportando coma como decimal.
 * Ejemplos: "12,50" → 12.5 | "12.50" → 12.5 | "1.234,56" → 1234.56 | "1,234.56" → 1234.56
 * Retorna null si no es un número válido.
 */
export function normalizarDecimal(raw: string | number | undefined | null, decimales = 2): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    if (isNaN(raw)) return null;
    const f = Math.pow(10, decimales);
    return Math.round(raw * f) / f;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Eliminar separadores de miles (punto o coma seguido de exactamente 3 dígitos)
  const sinMiles = s.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "");
  // Convertir coma decimal a punto
  const conPunto = sinMiles.replace(",", ".");
  const n = parseFloat(conPunto);
  if (isNaN(n)) return null;
  const f = Math.pow(10, decimales);
  return Math.round(n * f) / f;
}

/** Zod preprocess para montos: acepta string con coma o punto decimal. */
export const zMonto = z.preprocess(
  (v) => normalizarDecimal(typeof v === "string" || typeof v === "number" ? v : String(v ?? "")),
  z.number({ invalid_type_error: "Ingresa un monto válido" }).min(0.01, "El monto debe ser mayor a 0")
);

/** Zod preprocess para cantidades con n decimales (default 2, insumos 3). */
export function zCantidad(decimales = 2) {
  return z.preprocess(
    (v) => normalizarDecimal(typeof v === "string" || typeof v === "number" ? v : String(v ?? ""), decimales),
    z.number({ invalid_type_error: "Ingresa una cantidad válida" }).positive("La cantidad debe ser mayor a 0")
  );
}

/** Zod preprocess para montos que pueden ser cero (bonificaciones, descuentos vacíos). */
export const zMontoCero = z.preprocess(
  (v) => normalizarDecimal(typeof v === "string" || typeof v === "number" ? v : String(v ?? "")),
  z.number({ invalid_type_error: "Ingresa un monto válido" }).min(0, "El monto no puede ser negativo")
);

/** Totales impresos en la factura física (de la IA). Todos los campos son opcionales/null. */
export type TotalesImpresos = {
  base0?: number | null;
  base15?: number | null;
  descuento?: number | null;
  subtotal?: number | null;
  iva?: number | null;
  ice?: number | null;
  irbp?: number | null;
  otros?: number | null;
  total?: number | null;
} | null;
