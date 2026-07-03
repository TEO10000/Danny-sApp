import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// TODO: afinar con el correo real de Banco Pichincha cuando el cliente lo entregue

// TODO: ajustar según el formato exacto que usa Banco Pichincha en sus notificaciones
const PATRON_MONTO =
  /(?:valor|monto|transferencia(?:\s+de)?|deposito(?:\s+de)?)[:\s]*\$?\s*([\d]{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;

// TODO: ajustar según el campo de referencia/documento que incluya Banco Pichincha
const PATRON_REFERENCIA =
  /(?:referencia|comprobante|documento|transacci[oó]n|nro\.?|n[úu]mero)[:\s#]*(\w[\w\-]{3,30})/i;

// TODO: ajustar según el formato de hora en los correos de Banco Pichincha
const PATRON_HORA =
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)/;

// TODO: ajustar según cómo Banco Pichincha incluye el nombre del remitente
const PATRON_REMITENTE =
  /(?:remitente|ordenante|cliente|de)[:\s]+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]{3,50})/i;

function normalizarMonto(raw: string): number | null {
  // Eliminar separadores de miles (coma o punto si seguido de ≥3 dígitos o final de miles)
  // Soporta: 1.234,56 | 1,234.56 | 1234.56 | 1234,56
  const limpio = raw.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "").replace(",", ".");
  const n = parseFloat(limpio);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export interface DatosTransferencia {
  monto: number;
  referencia?: string;
  remitente?: string;
  hora?: Date;
}

// Capa 1: extracción por regex sobre texto plano
export function extraerConRegex(texto: string): DatosTransferencia | null {
  const matchMonto = PATRON_MONTO.exec(texto);
  if (!matchMonto) return null;
  const monto = normalizarMonto(matchMonto[1]);
  if (!monto) return null;

  const matchRef = PATRON_REFERENCIA.exec(texto);
  const matchRem = PATRON_REMITENTE.exec(texto);
  const matchHora = PATRON_HORA.exec(texto);

  let hora: Date | undefined;
  if (matchHora) {
    const partes = matchHora[1].split(/[\/\-]/).map(Number);
    const horaStr = matchHora[2];
    if (partes.length === 3) {
      // Intentar parsear como fecha Ecuador
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

const esquemaIA = z.object({
  monto: z.number().positive().max(10000),
  referencia: z.string().optional().nullable(),
  remitente: z.string().optional().nullable(),
  hora: z.string().optional().nullable(),
});

// Capa 2: fallback IA cuando la regex no encontró monto
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
