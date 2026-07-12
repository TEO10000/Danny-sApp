// ============================================================
// Volcado de correos de transferencia (Fase 6E — calibración)
// Imprime el TEXTO COMPLETO de los correos del banco que hablan
// de transferencias (ignora logins y mantenimiento), para poder
// calibrar las regex del parser con el formato real.
//
// Uso (desde panaderia-fase0/):
//   node --env-file=.env volcar-correos.mjs consejo
//   node --env-file=.env volcar-correos.mjs consejo 14   ← días (default 7)
//
// Solo lee e imprime. No modifica nada.
// ============================================================

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const sucursal = (process.argv[2] || "consejo").toLowerCase();
const dias = Number(process.argv[3] || 7);
const MAX_CORREOS = 8;
const MAX_CHARS = 2500;

const sufijo = sucursal.includes("principal") ? "PRINCIPAL" : "CONSEJO";
const user = process.env[`BANCO_IMAP_USER_${sufijo}`];
const pass = process.env[`BANCO_IMAP_PASS_${sufijo}`];
const remitente = process.env.BANCO_REMITENTE ?? "pichincha.com";

if (!user || !pass) {
  console.error(`Faltan BANCO_IMAP_USER_${sufijo} / BANCO_IMAP_PASS_${sufijo} en el .env`);
  process.exit(1);
}

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user, pass },
  logger: false,
});

console.log(`\n=== VOLCADO DE CORREOS DE TRANSFERENCIA · ${sucursal} · últimos ${dias} días ===`);

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const desde = new Date(Date.now() - dias * 86400000);
  const seqs = (await client.search({ since: desde, from: remitente })) || [];

  // Más recientes primero
  seqs.reverse();

  let impresos = 0;
  for (const seq of seqs) {
    if (impresos >= MAX_CORREOS) break;

    const msg = await client.fetchOne(String(seq), { source: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);

    const htmlTexto = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "";
    const texto = (parsed.text || htmlTexto || "").replace(/\s+/g, " ").trim();
    const asunto = parsed.subject ?? "";

    // Solo correos que hablan de transferencia; fuera logins y mantenimiento
    const esTransferencia = /transferencia/i.test(asunto) || /transferencia/i.test(texto);
    const esRuido = /ingreso a banca m[oó]vil|mantenimiento/i.test(texto) || /mantenimiento/i.test(asunto);
    if (!esTransferencia || esRuido) continue;

    impresos++;
    console.log(`\n${"═".repeat(70)}`);
    console.log(`CORREO #${impresos}`);
    console.log(`Asunto : ${asunto}`);
    console.log(`Fecha  : ${parsed.date?.toISOString() ?? "?"}`);
    console.log(`De     : ${parsed.from?.text ?? "?"}`);
    console.log(`Msg-ID : ${parsed.messageId ?? "?"}`);
    console.log(`${"─".repeat(70)}`);
    console.log(texto.slice(0, MAX_CHARS));
    if (texto.length > MAX_CHARS) console.log(`… [cortado: ${texto.length} caracteres en total]`);
  }

  if (impresos === 0) {
    console.log("\nNo se encontraron correos de transferencia en la ventana. Prueba aumentando los días.");
  }
} finally {
  lock.release();
  await client.logout();
}
console.log(`\n=== FIN ===\n`);
