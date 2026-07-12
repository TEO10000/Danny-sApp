#!/usr/bin/env node
// Uso: node --env-file=.env scripts/calibrar-correos.mjs
// Conecta al buzón, imprime asunto + texto limpio de los últimos 15 correos
// por cada remitente y muestra qué extraería cada parser.
// Sirve para calibrar los patrones antes de usar en producción.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// ── Config ────────────────────────────────────────────────────────────────────

const IMAP_USER = process.env.BANCO_IMAP_USER_PRINCIPAL;
const IMAP_PASS = process.env.BANCO_IMAP_PASS_PRINCIPAL;

if (!IMAP_USER || !IMAP_PASS) {
  console.error("Faltan BANCO_IMAP_USER_PRINCIPAL y/o BANCO_IMAP_PASS_PRINCIPAL en .env");
  process.exit(1);
}

const REMITENTES = [
  { dominio: "deunaapp.com", canal: "DEUNA", limite: 15 },
  { dominio: process.env.BANCO_REMITENTE ?? "pichincha.com", canal: "PICHINCHA", limite: 15 },
];

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
  console.log(`\nConectado como ${IMAP_USER}\n`);

  const since30d = new Date(Date.now() - 30 * 86400000);

  for (const rem of REMITENTES) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`REMITENTE: ${rem.dominio} (canal: ${rem.canal})`);
    console.log("=".repeat(60));

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
      let msgFull;
      try {
        msgFull = await client.fetchOne(String(uid), { source: true }, { uid: true });
      } catch { continue; }
      if (!msgFull?.source) continue;

      let parsed;
      try {
        parsed = await simpleParser(msgFull.source);
      } catch { continue; }

      const asunto = parsed.subject ?? "(sin asunto)";
      const htmlTexto = typeof parsed.html === "string" ? limpiarHtml(parsed.html) : "";
      const textoPlano = (parsed.text || htmlTexto || "").slice(0, 800);

      console.log(`--- UID ${uid} | ${parsed.date?.toISOString().slice(0, 16)} ---`);
      console.log(`Asunto: ${asunto}`);
      console.log(`De:     ${parsed.from?.text ?? "?"}`);
      console.log(`Texto (primeros 300 chars):\n${textoPlano.slice(0, 300)}`);

      let resultado;
      if (rem.canal === "DEUNA") {
        resultado = extraerDeuna(asunto, textoPlano);
        console.log(`Parser Deuna: ${resultado ? JSON.stringify(resultado) : "❌ sin datos"}`);
      } else {
        resultado = extraerConRegex(textoPlano);
        console.log(`Parser Pichincha regex: ${resultado ? JSON.stringify(resultado) : "❌ sin datos (caería a IA)"}`);
      }
      console.log("");
    }
  }
} catch (err) {
  console.error("Error:", err.message);
} finally {
  try { client.logout(); } catch { /* ok */ }
}
