import { normalizarDecimal } from "./decimales";

export interface DatosQR {
  monto?: number;
  comprobante?: string;
  uuid?: string;              // UUID del comprobante Deuna — prioridad para idempotencia
  beneficiario?: string;
  cuentaEnmascarada?: string; // ej. "****5688" — discriminador confiable de sucursal
  pagador?: string;
  fecha?: Date;               // fecha del pago (epoch QR) — SOLO para el aviso "no es de hoy"
  banco?: string;
  urlVerificacion?: string;
  confiable: boolean;
}

// ── Titulares y cuentas de cada sucursal ──────────────────────────────────────
//
// cuentaEnmascarada: discriminador primario (comparación exacta con t[7] del QR)
// tokens: fallback por nombre, todos deben estar presentes (⚠ ambos comparten "morales")
export const CUENTAS_SUCURSAL: Array<{
  sucursal: "Consejo" | "Principal";
  cuentaEnmascarada: string;
  tokens: string[];
}> = [
  { sucursal: "Consejo",   cuentaEnmascarada: "****5688", tokens: ["silvia",  "morales"] }, // Silvia Patricia Morales Parra
  { sucursal: "Principal", cuentaEnmascarada: "****4146", tokens: ["daniel",  "herrera"] }, // Daniel Sebastian Herrera Morales
];

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

/**
 * Detecta la sucursal en dos pasos:
 * 1. Por cuenta enmascarada (****XXXX) — exacta y confiable.
 * 2. Por tokens del nombre normalizado — TODOS deben estar presentes.
 * ⚠ "morales" aparece en ambas titulares: nunca matchear por un solo token.
 */
export function detectarSucursal(
  beneficiario?: string,
  cuentaEnmascarada?: string
): "Consejo" | "Principal" | null {
  // Paso 1: por cuenta enmascarada (discriminador más confiable)
  if (cuentaEnmascarada) {
    for (const entrada of CUENTAS_SUCURSAL) {
      if (entrada.cuentaEnmascarada === cuentaEnmascarada) return entrada.sucursal;
    }
  }

  // Paso 2: por tokens del nombre (todos presentes)
  if (beneficiario) {
    const norm = normalizarTexto(beneficiario);
    for (const entrada of CUENTAS_SUCURSAL) {
      if (entrada.tokens.every((token) => norm.includes(token))) return entrada.sucursal;
    }
  }

  return null;
}

// ── Parser Deuna / ONLINE: ─────────────────────────────────────────────────
//
// Formato verificado:
//   ONLINE: {tipo}:{banco}:{pagador}:{cuentaOrigen}:{red}:{beneficiario}:{ctaDest****}:{monto}:{epochSeg}:{uuid}:{comprobante}:{hashHex}
//
// t[4] = cuenta de origen del pagador. DATO SENSIBLE: solo vive en qrCrudo, nunca en pantalla.

const RE_UUID       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_EPOCH_10   = /^\d{10}$/;
const RE_MONTO_POS  = /^\d+(\.\d{1,2})?$/;
const RE_COMPROBANTE = /^\d{6,12}$/;
const RE_HASH       = /^[0-9a-f]{64,}$/i;
const RE_MASCARA    = /^\*{4}\d+$/;

function parsearDeunaQR(crudo: string): DatosQR | null {
  const tokens = crudo.split(":").map((t) => t.trim());

  // Gate: empieza con ONLINE y el segundo token contiene _TO_
  if (tokens[0] !== "ONLINE" || !tokens[1]?.includes("_TO_")) return null;

  // ── Intento posicional ────────────────────────────────────────────────────
  if (tokens.length >= 13) {
    const monto = normalizarDecimal(tokens[8]);
    const epochStr    = tokens[9];
    const uuid        = tokens[10];
    const comprobante = tokens[11];
    const hash        = tokens[12];

    if (
      monto !== null &&
      monto > 0 &&
      RE_MONTO_POS.test(tokens[8]) &&
      RE_EPOCH_10.test(epochStr) &&
      RE_UUID.test(uuid) &&
      RE_COMPROBANTE.test(comprobante) &&
      RE_HASH.test(hash)
    ) {
      const epoch = parseInt(epochStr, 10);
      return {
        monto,
        comprobante,
        uuid,
        beneficiario:      tokens[6],
        cuentaEnmascarada: tokens[7],           // ****XXXX — para detectar sucursal
        pagador:           tokens[3],           // nombre (t[4] = cuenta, nunca se propaga)
        banco:             `${tokens[2]} → ${tokens[5]}`,
        fecha:             new Date(epoch * 1000),
        confiable: true,
      };
    }
  }

  // ── Heurística de rescate (variantes, campos de más/menos) ───────────────
  let monto: number | undefined;
  let epoch: number | undefined;
  let uuid: string | undefined;
  let comprobante: string | undefined;
  let beneficiario: string | undefined;
  let cuentaEnmascarada: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // UUID
    if (RE_UUID.test(t)) {
      uuid = t;
      // Comprobante: solo dígitos, inmediatamente después del UUID
      const next = tokens[i + 1];
      if (next && RE_COMPROBANTE.test(next)) comprobante = next;
      continue;
    }

    // Epoch: 10 dígitos, año entre 2020 y 2035
    if (RE_EPOCH_10.test(t) && epoch === undefined) {
      const year = new Date(parseInt(t, 10) * 1000).getUTCFullYear();
      if (year >= 2020 && year <= 2035) { epoch = parseInt(t, 10); continue; }
    }

    // Monto: dígitos con exactamente 2 decimales
    if (/^\d+\.\d{2}$/.test(t) && monto === undefined) {
      const m = normalizarDecimal(t);
      if (m && m > 0) { monto = m; continue; }
    }

    // Beneficiario: token de texto que precede a la cuenta enmascarada (****XXXX)
    if (i + 1 < tokens.length && RE_MASCARA.test(tokens[i + 1])) {
      beneficiario = t;
      cuentaEnmascarada = tokens[i + 1];
    }
  }

  if (monto !== undefined && (uuid !== undefined || comprobante !== undefined)) {
    return {
      monto,
      comprobante,
      uuid,
      beneficiario,
      cuentaEnmascarada,
      pagador: tokens[3] ?? undefined,
      banco: tokens[2] && tokens[5] ? `${tokens[2]} → ${tokens[5]}` : undefined,
      fecha: epoch !== undefined ? new Date(epoch * 1000) : undefined,
      confiable: true,
    };
  }

  return null;
}

// ── Regex fallback (URLs, texto libre) ────────────────────────────────────

const PATRON_MONTO        = /\$\s*([\d]{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;
const PATRON_COMPROBANTE  = /(?:comprobante|documento|transacci[oó]n|no\.|n[úu]mero)[:\s#]*(\d{6,12})/i;
const PATRON_BENEFICIARIO = /\bA[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,60})/;
const PATRON_PAGADOR      = /\bDe[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,60})/;
const PATRON_FECHA        = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[T\s,]+(\d{1,2}:\d{2}))?/;

const DOMINIOS_BANCO: Record<string, string> = {
  "deunaapp.com":       "Deuna",
  "deuna.com":          "Deuna",
  "pichincha.com":      "Pichincha",
  "bancopichincha.com": "Pichincha",
  "produbanco.com":     "Produbanco",
  "bancodelaustro.com": "Austro",
  "bancoguayaquil.com": "Guayaquil",
};

function detectarBancoPorDominio(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [dominio, banco] of Object.entries(DOMINIOS_BANCO)) {
      if (host.includes(dominio)) return banco;
    }
  } catch { /* no es URL válida */ }
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
 * Parser síncrono (cliente y servidor). Sin fetch ni Node APIs.
 * Úsalo para poblar la tarjeta de confirmación antes de guardar.
 *
 * `fecha` en DatosQR = fecha del pago del QR (solo para el aviso "no es de hoy").
 * La `hora` guardada en BD siempre es new Date() (momento de escaneo).
 */
export function parsearQRSync(crudo: string): DatosQR {
  // Intento 1: formato ONLINE: (Deuna y variantes)
  if (/^ONLINE[\s:]/i.test(crudo.trimStart())) {
    const deuna = parsearDeunaQR(crudo);
    if (deuna) return deuna;
  }

  // Intento 2: URL
  const esUrl = /^https?:\/\//i.test(crudo.trim());
  const resultado: DatosQR = { confiable: false };

  if (esUrl) {
    resultado.urlVerificacion = crudo.trim();
    resultado.banco = detectarBancoPorDominio(crudo.trim());
  }

  // Intento 3: regex libre
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
