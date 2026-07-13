#!/usr/bin/env node
// Uso: node --env-file=.env scripts/calibrar-correos.mjs
// Conecta al buzón, imprime tabla de diagnóstico de fechas + texto del correo.
// Sirve para calibrar parsers y detectar si Deuna manda el header Date con offset incorrecto.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// ── Config ────────────────────────────────────────────────────────────────────

// Usar PRINCIPAL si está disponible, si no CONSEJO
const IMAP_USER = process.env.BANCO_IMAP_USER_PRINCIPAL ?? process.env.BANCO_IMAP_USER_CONSEJO;
const IMAP_PASS = process.env.BANCO_IMAP_PASS_PRINCIPAL ?? process.env.BANCO_IMAP_PASS_CONSEJO;
const CUENTA_USADA = process.env.BANCO_IMAP_USER_PRINCIPAL ? "PRINCIPAL" : "CONSEJO";

if (!IMAP_USER || !IMAP_PASS) {
  console.error("Faltan credenciales BANCO_IMAP_USER_*/BANCO_IMAP_PASS_* en .env");
  process.exit(1);
}

const REMITENTES = [
  { dominio: "deunaapp.com", canal: "DEUNA", limite: 15 },
  { dominio: process.env.BANCO_REMITENTE ?? "pichincha.com", canal: "PICHINCHA", limite: 15 },
];

const fmtEC = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

// Patrón para encontrar fecha/hora impresa en el cuerpo
const PATRON_FECHA_CUERPO = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)/;
const PATRON_HORA_CUERPO  = /\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap][Mm])?)\b/;

// ── Parsers inline (espejo de banco-parser.ts) ────────────────────────────────

function normalizarDecimal(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const sinMiles = s.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "");
  const conPunto = sinMiles.replace(",", ".");
  const n = parseFloat(conPunto);
  if (isNaN(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function limpiarHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extraerDeuna(asunto, texto) {
  const matchMonto = /[Rr]ecibiste\s+\$\s*([\d]+[.,]\d{1,2})/i.exec(asunto);
  if (!matchMonto) return null;
  const monto = normalizarDecimal(matchMonto[1]);
  if (!monto) return null;
  const matchRef = /(?:transacci[oó]n|referencia|n[úu]mero)[:\s#]*([A-Za-z0-9][\w\-]{3,40})/i.exec(texto);
  const matchRem = /(?:de\s*:[:\s]|de\s+)((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s?){2,5})/i.exec(texto);
  return { monto, referencia: matchRef?.[1]?.trim(), remitente: matchRem?.[1]?.trim() };
}

function extraerConRegex(texto) {
  const PATRON_MONTO = /(?:valor|monto|transferencia(?:\s+de)?|deposito(?:\s+de)?)[:\s]*\$?\s*([\d]{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;
  const match = PATRON_MONTO.exec(texto);
  if (!match) return null;
  const monto = normalizarDecimal(match[1]);
  if (!monto) return null;
  const matchRef = /(?:referencia|comprobante|documento|transacci[oó]n)[:\s#]*(\w[\w\-]{3,30})/i.exec(texto);
  return { monto, referencia: matchRef?.[1]?.trim() };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: IMAP_USER, pass: IMAP_PASS },
  logger: false,
});

try {
  await client.connect();
  await client.getMailboxLock("INBOX");
  console.log(`\nConectado como ${IMAP_USER} (cuenta: ${CUENTA_USADA})\n`);

  const since30d = new Date(Date.now() - 30 * 86400000);

  for (const rem of REMITENTES) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`REMITENTE: ${rem.dominio} (canal: ${rem.canal})`);
    console.log("=".repeat(70));

    let uids = [];
    try {
      const result = await client.search({ since: since30d, from: rem.dominio }, { uid: true });
      uids = Array.isArray(result) ? result.slice(-rem.limite) : [];
    } catch (e) {
      console.log(`Error en búsqueda: ${e.message}`);
      continue;
    }

    if (uids.length === 0) {
      console.log("(sin correos en los últimos 30 días)");
      continue;
    }

    console.log(`Encontrados: ${uids.length} correo(s)\n`);

    for (const uid of uids) {
      // Fetch envelope + source juntos
      let msgFull;
      try {
        msgFull = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      } catch { continue; }
      if (!msgFull?.source) continue;

      let parsed;
      try {
        parsed = await simpleParser(msgFull.source);
      } catch { continue; }

      const asunto = parsed.subject ?? "(sin asunto)";
      const htmlTexto = typeof parsed.html === "string" ? limpiarHtml(parsed.html) : "";
      const textoPlano = (parsed.text || htmlTexto || "").slice(0, 1200);

      // Fechas para la tabla de diagnóstico
      const envelopeDate = msgFull.envelope?.date;
      const parsedDate   = parsed.date;
      const rawDateHeader = parsed.headers?.get?.("date") ?? "(no disponible)";

      console.log(`--- UID ${uid} ---`);
      console.log(`Asunto         : ${asunto}`);
      console.log(`De             : ${parsed.from?.text ?? "?"}`);
      console.log(`Date: header   : ${Array.isArray(rawDateHeader) ? rawDateHeader[0] : rawDateHeader}`);
      console.log(`envelope.date  : ${envelopeDate ? envelopeDate.toISOString() : "null"}`);
      console.log(`parsed.date ISO: ${parsedDate ? parsedDate.toISOString() : "null"}`);
      console.log(`parsed.date EC : ${parsedDate ? fmtEC.format(parsedDate) : "null"}`);

      // Buscar fecha/hora impresa en el cuerpo
      const matchFechaHora = PATRON_FECHA_CUERPO.exec(textoPlano);
      const matchHoraSola  = PATRON_HORA_CUERPO.exec(textoPlano);
      if (matchFechaHora) {
        console.log(`Fecha/hora cuerpo: ${matchFechaHora[0].trim()}`);
      } else if (matchHoraSola) {
        console.log(`Hora cuerpo    : ${matchHoraSola[0].trim()}`);
      } else {
        console.log(`Fecha/hora cuerpo: (no encontrada)`);
      }

      // Extracto del cuerpo
      const extracto = textoPlano.slice(0, 300).replace(/\n/g, " ");
      console.log(`Cuerpo (300c)  : ${extracto}`);

      let resultado;
      if (rem.canal === "DEUNA") {
        resultado = extraerDeuna(asunto, textoPlano);
        console.log(`Parser Deuna   : ${resultado ? JSON.stringify(resultado) : "❌ sin datos"}`);
      } else {
        resultado = extraerConRegex(textoPlano);
        console.log(`Parser Pichincha: ${resultado ? JSON.stringify(resultado) : "❌ sin datos (caería a IA)"}`);
      }
      console.log("");
    }
  }
} catch (err) {
  console.error("Error:", err.message);
} finally {
  try { client.logout(); } catch { /* ok */ }
}
