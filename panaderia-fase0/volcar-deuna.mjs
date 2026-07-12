// ============================================================
// Volcado de correos Deuna — dinero ENTRANTE (Fase 6F — calibración)
// Filtra solo "¡Recibiste $X en tu cuenta Deuna!" (pagos de clientes).
// Ignora "¡Listo! ... recibió tus $X" (pagos salientes de la dueña)
// y "Nuevo inicio de sesión en Deuna" (login, ruido).
//
// Uso (desde panaderia-fase0/):
//   node --env-file=.env volcar-deuna.mjs consejo
//   node --env-file=.env volcar-deuna.mjs consejo 14   ← días (default 3, hay MUCHO volumen)
//
// Solo lee e imprime. No modifica nada.
// ============================================================

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const sucursal = (process.argv[2] || "consejo").toLowerCase();
const dias = Number(process.argv[3] || 3);
const MAX_CORREOS = 6;
const MAX_CHARS = 2000;

const sufijo = sucursal.includes("principal") ? "PRINCIPAL" : "CONSEJO";
const user = process.env[`BANCO_IMAP_USER_${sufijo}`];
const pass = process.env[`BANCO_IMAP_PASS_${sufijo}`];
// Confirmado en notas del proyecto: remitente Deuna = notificaciones@deunaapp.com
const remitenteDeuna = process.env.DEUNA_REMITENTE ?? "deunaapp.com";

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

console.log(`\n=== VOLCADO DEUNA (dinero entrante) · ${sucursal} · últimos ${dias} días ===`);

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  const desde = new Date(Date.now() - dias * 86400000);
  const seqs = (await client.search({ since: desde, from: remitenteDeuna })) || [];
  seqs.reverse(); // más recientes primero

  let impresos = 0;
  for (const seq of seqs) {
    if (impresos >= MAX_CORREOS) break;

    const msg = await client.fetchOne(String(seq), { source: true });
    if (!msg?.source) continue;
    const parsed = await simpleParser(msg.source);
    const asunto = parsed.subject ?? "";

    // Solo dinero ENTRANTE: asunto empieza con "¡Recibiste"
    // Descarta "¡Listo!" (salientes) y "Nuevo inicio de sesión" (login)
    const esEntrante = /recibiste/i.test(asunto);
    const esRuido = /inicio de sesi[oó]n|¡listo!/i.test(asunto);
    if (!esEntrante || esRuido) continue;

    // Preferir texto plano si existe; si no, limpiar el HTML quitando
    // primero los bloques <style>/<script> completos (antes solo se
    // quitaban las etiquetas, dejando el CSS suelto como "texto").
    let texto = parsed.text || "";
    if (!texto && typeof parsed.html === "string") {
      texto = parsed.html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ");
    }
    texto = texto.replace(/\s+/g, " ").trim();

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

  // Conteo real de "Recibiste" en toda la ventana (no solo los impresos)
  let totalRecibiste = 0;
  for (const seq of seqs) {
    const msg = await client.fetchOne(String(seq), { envelope: true });
    const asuntoEnv = msg?.envelope?.subject ?? "";
    if (/recibiste/i.test(asuntoEnv) && !/inicio de sesi[oó]n/i.test(asuntoEnv)) totalRecibiste++;
  }
  console.log(`\nTotal de correos "Recibiste" (dinero entrante) en los últimos ${dias} días: ${totalRecibiste}`);

  if (impresos === 0) {
    console.log("\nNo se encontraron correos 'Recibiste' de Deuna en la ventana.");
    console.log("Prueba con más días, o revisa si DEUNA_REMITENTE necesita ajustarse.");
  } else if (totalRecibiste > impresos) {
    console.log(`(Se imprimió el detalle completo de los ${impresos} más recientes; hay ${totalRecibiste - impresos} más sin mostrar)`);
  }
} finally {
  lock.release();
  await client.logout();
}
console.log(`\n=== FIN ===\n`);
