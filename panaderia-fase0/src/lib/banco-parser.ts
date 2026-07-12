import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { normalizarDecimal } from "./decimales";

// ── Patrones Banco Pichincha (TODO: calibrar con correos reales) ──────────────

const PATRON_MONTO =
  /(?:valor|monto|transferencia(?:\s+de)?|deposito(?:\s+de)?)[:\s]*\$?\s*([\d]{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;

const PATRON_REFERENCIA =
  /(?:referencia|comprobante|documento|transacci[oó]n|nro\.?|n[úu]mero)[:\s#]*(\w[\w\-]{3,30})/i;

const PATRON_HORA =
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)/;

const PATRON_REMITENTE =
  /(?:remitente|ordenante|cliente|de)[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,50})/i;

// ── Patrones Deuna ────────────────────────────────────────────────────────────

// Asunto: "¡Recibiste $X,XX en tu cuenta Deuna!" (coma como decimal)
const PATRON_DEUNA_MONTO = /[Rr]ecibiste\s+\$\s*([\d]+[.,]\d{1,2})/i;
const PATRON_DEUNA_REF = /(?:transacci[oó]n|referencia|n[úu]mero)[:\s#]*([A-Za-z0-9][\w\-]{3,40})/i;
const PATRON_DEUNA_REM = /(?:de\s*:[:\s]|de\s+)((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s?){2,5})/i;

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface DatosTransferencia {
  monto: number;
  referencia?: string;
  remitente?: string;
  hora?: Date;
}

// ── Extracción Deuna ──────────────────────────────────────────────────────────

export function extraerDeuna(asunto: string, texto: string): DatosTransferencia | null {
  const matchMonto = PATRON_DEUNA_MONTO.exec(asunto);
  if (!matchMonto) return null;

  const monto = normalizarDecimal(matchMonto[1]);
  if (!monto || monto <= 0) return null;

  const matchRef = PATRON_DEUNA_REF.exec(texto);
  const matchRem = PATRON_DEUNA_REM.exec(texto);

  return {
    monto,
    referencia: matchRef?.[1]?.trim() || undefined,
    remitente: matchRem?.[1]?.trim() || undefined,
    // hora: la provee el caller desde parsed.date del correo
  };
}

// ── Extracción Pichincha por regex ────────────────────────────────────────────

export function extraerConRegex(texto: string): DatosTransferencia | null {
  const matchMonto = PATRON_MONTO.exec(texto);
  if (!matchMonto) return null;
  const monto = normalizarDecimal(matchMonto[1]);
  if (!monto || monto <= 0) return null;

  const matchRef = PATRON_REFERENCIA.exec(texto);
  const matchRem = PATRON_REMITENTE.exec(texto);
  const matchHora = PATRON_HORA.exec(texto);

  let hora: Date | undefined;
  if (matchHora) {
    const partes = matchHora[1].split(/[\/\-]/).map(Number);
    const horaStr = matchHora[2];
    if (partes.length === 3) {
      const [d, m, y] = partes[2] > 31 ? [partes[0], partes[1], partes[2]] : [partes[0], partes[1], partes[2]];
      const iso = `${y.toString().length === 2 ? "20" + y : y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${horaStr.padStart(5, "0")}:00-05:00`;
      const candidata = new Date(iso);
      if (!isNaN(candidata.getTime())) hora = candidata;
    }
  }

  return {
    monto,
    referencia: matchRef?.[1]?.trim() || undefined,
    remitente: matchRem?.[1]?.trim() || undefined,
    hora,
  };
}

// ── Extracción por IA (fallback Pichincha) ────────────────────────────────────

const esquemaIA = z.object({
  monto: z.number().positive().max(10000),
  referencia: z.string().optional().nullable(),
  remitente: z.string().optional().nullable(),
  hora: z.string().optional().nullable(),
});

export async function extraerConIA(textoCorreo: string): Promise<DatosTransferencia | null> {
  const MODELO_IA = "claude-sonnet-4-5";
  const PROMPT = `Eres un asistente contable. Analiza este correo de notificación bancaria y extrae los datos de la transferencia en JSON puro (sin markdown, sin explicaciones).

Responde ÚNICAMENTE con este JSON:
{
  "monto": número positivo (sin símbolo de moneda, ≤ 10000),
  "referencia": "número de comprobante o null",
  "remitente": "nombre de quien transfirió o null",
  "hora": "ISO 8601 o null"
}

Si no puedes extraer el monto con certeza, usa 0.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const respuesta = await anthropic.messages.create({
      model: MODELO_IA,
      max_tokens: 256,
      messages: [{ role: "user", content: `${PROMPT}\n\nCORREO:\n${textoCorreo.slice(0, 3000)}` }],
    });
    const texto = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";
    const jsonLimpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const crudo = JSON.parse(jsonLimpio);
    const validado = esquemaIA.safeParse(crudo);
    if (!validado.success || validado.data.monto <= 0) return null;
    const d = validado.data;
    let hora: Date | undefined;
    if (d.hora) {
      const candidata = new Date(d.hora);
      if (!isNaN(candidata.getTime())) hora = candidata;
    }
    return {
      monto: d.monto,
      referencia: d.referencia ?? undefined,
      remitente: d.remitente ?? undefined,
      hora,
    };
  } catch {
    return null;
  }
}
