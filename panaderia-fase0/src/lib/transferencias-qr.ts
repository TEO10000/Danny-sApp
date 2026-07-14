import { normalizarDecimal } from "./decimales";

export interface DatosQR {
  monto?: number;
  comprobante?: string;
  beneficiario?: string;
  pagador?: string;
  fecha?: Date;
  banco?: string;
  urlVerificacion?: string;
  confiable: boolean;
}

// Titulares de cada sucursal — confirmar nombre completo del titular de Principal
export const TITULARES_SUCURSAL: Array<{ tokens: string[]; sucursal: "Consejo" | "Principal" }> = [
  { tokens: ["silvia", "morales"], sucursal: "Consejo" },   // Silvia Patricia Morales Parra
  { tokens: ["daniel", "herrera"], sucursal: "Principal" }, // TODO: confirmar nombre completo del titular de Principal
];

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

export function detectarSucursal(beneficiario: string): "Consejo" | "Principal" | null {
  const norm = normalizarTexto(beneficiario);
  for (const entrada of TITULARES_SUCURSAL) {
    if (entrada.tokens.every((token) => norm.includes(token))) {
      return entrada.sucursal;
    }
  }
  return null;
}

// Regex tolerantes para extracción de texto QR
const PATRON_MONTO = /\$\s*([\d]{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;
const PATRON_COMPROBANTE =
  /(?:comprobante|documento|transacci[oó]n|no\.|n[úu]mero)[:\s#]*(\d{6,12})/i;
const PATRON_BENEFICIARIO = /\bA[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,60})/;
const PATRON_PAGADOR = /\bDe[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,60})/;
const PATRON_FECHA =
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s,]+(\d{1,2}:\d{2}))?/;

const DOMINIOS_BANCO: Record<string, string> = {
  "deunaapp.com": "Deuna",
  "deuna.com": "Deuna",
  "pichincha.com": "Pichincha",
  "bancopichincha.com": "Pichincha",
  "produbanco.com": "Produbanco",
  "bancodelaustro.com": "Austro",
  "bancoguayaquil.com": "Guayaquil",
};

function detectarBancoPorDominio(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [dominio, banco] of Object.entries(DOMINIOS_BANCO)) {
      if (host.includes(dominio)) return banco;
    }
  } catch {
    // no es URL válida
  }
  return undefined;
}

function parsearFecha(crudo: string): Date | undefined {
  const m = PATRON_FECHA.exec(crudo);
  if (!m) return undefined;
  const [, d, mes, anioRaw, horaStr] = m;
  const anio = anioRaw.length === 2 ? `20${anioRaw}` : anioRaw;
  const iso = `${anio}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}T${horaStr ? horaStr.padStart(5, "0") : "00:00"}:00-05:00`;
  const candidata = new Date(iso);
  return isNaN(candidata.getTime()) ? undefined : candidata;
}

/**
 * Parser síncrono (cliente y servidor). Solo regex, sin fetch ni Node APIs.
 * Úsalo para poblar la tarjeta de confirmación antes de guardar.
 */
export function parsearQRSync(crudo: string): DatosQR {
  const esUrl = /^https?:\/\//i.test(crudo.trim());
  const resultado: DatosQR = { confiable: false };

  if (esUrl) {
    resultado.urlVerificacion = crudo.trim();
    resultado.banco = detectarBancoPorDominio(crudo.trim());
  }

  const montoM = PATRON_MONTO.exec(crudo);
  if (montoM) {
    const m = normalizarDecimal(montoM[1]);
    if (m && m > 0) resultado.monto = m;
  }

  const compM = PATRON_COMPROBANTE.exec(crudo);
  if (compM) resultado.comprobante = compM[1];

  const benM = PATRON_BENEFICIARIO.exec(crudo);
  if (benM) resultado.beneficiario = benM[1].trim();

  const pagM = PATRON_PAGADOR.exec(crudo);
  if (pagM) resultado.pagador = pagM[1].trim();

  resultado.fecha = parsearFecha(crudo);
  resultado.confiable = (resultado.monto ?? 0) > 0;

  return resultado;
}
