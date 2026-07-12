// ============================================================
// Diagnóstico de lectura de transferencias (Fase 6E)
// Prueba cada capa por separado: credenciales → conexión IMAP
// → búsqueda por remitente → ventana de tiempo → parser regex.
//
// Uso (desde panaderia-fase0/, donde ya están imapflow y mailparser):
//   node --env-file=.env diagnostico-banco.mjs consejo
//   node --env-file=.env diagnostico-banco.mjs principal
//   node --env-file=.env diagnostico-banco.mjs consejo 14   ← días hacia atrás (default 7)
//
// NO modifica nada: solo lee el buzón e imprime resultados.
// ============================================================

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// --- Mismas regex que src/lib/banco-parser.ts (copiadas para el diagnóstico) ---
const PATRON_MONTO =
  /(?:valor|monto|transferencia(?:\s+de)?|deposito(?:\s+de)?)[:\s]*\$?\s*([\d]{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/i;
const PATRON_REFERENCIA =
  /(?:referencia|comprobante|documento|transacci[oó]n|nro\.?|n[úu]mero)[:\s#]*(\w[\w\-]{3,30})/i;

const sucursal = (process.argv[2] || "consejo").toLowerCase();
const dias = Number(process.argv[3] || 7);

const ok = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  ℹ️  ${m}`);

console.log(`\n=== DIAGNÓSTICO 6E · sucursal: ${sucursal} · últimos ${dias} días ===\n`);

// ------------------------------------------------------------
// PASO 1 — Variables de entorno
// ------------------------------------------------------------
console.log("PASO 1 · Variables de entorno");
const sufijo = sucursal.includes("principal") ? "PRINCIPAL" : "CONSEJO";
const user = process.env[`BANCO_IMAP_USER_${sufijo}`];
const pass = process.env[`BANCO_IMAP_PASS_${sufijo}`];
const remitente = process.env.BANCO_REMITENTE ?? "pichincha.com";

if (!user) fail(`Falta BANCO_IMAP_USER_${sufijo} en el .env`);
else ok(`BANCO_IMAP_USER_${sufijo} = ${user}`);
if (!pass) fail(`Falta BANCO_IMAP_PASS_${sufijo} en el .env`);
else {
  ok(`BANCO_IMAP_PASS_${sufijo} presente (${pass.length} caracteres${pass.includes(" ") ? ", CONTIENE ESPACIOS" : ""})`);
  if (pass.replace(/\s/g, "").length !== 16)
    info("Un app password de Gmail tiene 16 letras. Si el largo no cuadra, probablemente pegaste la contraseña normal o le falta un pedazo.");
}
info(`Filtro de remitente (BANCO_REMITENTE): "${remitente}"`);
if (!user || !pass) {
  console.log("\n→ Sin credenciales no hay nada que probar. Este es el mismo caso en que la app muestra 'buzón de correo no configurado'.");
  console.log("  OJO: si funciona localmente, revisa que estas mismas variables existan también en Vercel → Settings → Environment Variables.\n");
  process.exit(1);
}

// ------------------------------------------------------------
// PASO 2 — Conexión y autenticación IMAP
// ------------------------------------------------------------
console.log("\nPASO 2 · Conexión a imap.gmail.com:993");
const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user, pass },
  logger: false,
});

const t0 = Date.now();
try {
  await client.connect();
  ok(`Conectado y autenticado en ${Date.now() - t0} ms`);
} catch (err) {
  fail(`Falló la conexión/autenticación: ${err.message}`);
  if (/invalid credentials|authenticationfailed/i.test(String(err.message))) {
    info("Gmail rechazó las credenciales. Causas típicas:");
    info(" - El app password es incorrecto o fue revocado (se regenera en myaccount.google.com/apppasswords)");
    info(" - Se está usando la contraseña normal de la cuenta en vez del app password");
    info(" - La verificación en 2 pasos se desactivó (eso invalida los app passwords)");
  }
  process.exit(1);
}

// ------------------------------------------------------------
// PASO 3 — Búsqueda por remitente
// ------------------------------------------------------------
console.log(`\nPASO 3 · Buscar correos de "${remitente}" en INBOX (últimos ${dias} días)`);
const lock = await client.getMailboxLock("INBOX");
try {
  const desde = new Date(Date.now() - dias * 86400000);
  const uidsBanco = (await client.search({ since: desde, from: remitente })) || [];

  if (uidsBanco.length === 0) {
    fail(`0 correos encontrados con remitente que contenga "${remitente}".`);
    info("Puede que el banco use otra dirección. Listando los últimos 15 correos del buzón para identificar al remitente real:\n");
    const todos = (await client.search({ since: desde })) || [];
    const ultimos = todos.slice(-15);
    for (const seq of ultimos) {
      const msg = await client.fetchOne(String(seq), { envelope: true });
      const from = msg?.envelope?.from?.[0];
      const fromStr = from ? `${from.name || ""} <${from.address || ""}>` : "(desconocido)";
      console.log(`     · ${msg?.envelope?.date?.toISOString?.() ?? "?"}  ${fromStr}  —  ${msg?.envelope?.subject ?? ""}`);
    }
    console.log("\n→ Si ves aquí las notificaciones del banco con OTRA dirección, ajusta BANCO_REMITENTE a esa dirección (o su dominio).");
    console.log("→ Si NO aparecen notificaciones del banco, el problema está antes de la app: las notificaciones no llegan a este buzón (¿están activadas en la banca web? ¿llegan a otro correo? ¿caen en Spam u otra pestaña?). IMAP con INBOX no ve la carpeta Spam.\n");
  } else {
    ok(`${uidsBanco.length} correo(s) del banco encontrados.`);

    // ------------------------------------------------------------
    // PASO 4 — Parseo de cada correo con la regex actual
    // ------------------------------------------------------------
    console.log("\nPASO 4 · Probar el parser (regex actual) sobre cada correo\n");
    let extraidos = 0;
    for (const seq of uidsBanco) {
      const msg = await client.fetchOne(String(seq), { source: true });
      if (!msg?.source) continue;
      const parsed = await simpleParser(msg.source);
      const htmlTexto = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "";
      const texto = parsed.text || htmlTexto || "";

      const mMonto = PATRON_MONTO.exec(texto);
      const mRef = PATRON_REFERENCIA.exec(texto);

      console.log(`  ── Correo: "${parsed.subject}" · ${parsed.date?.toISOString() ?? "sin fecha"}`);
      console.log(`     Message-ID: ${parsed.messageId ?? "(sin message-id)"}`);
      if (mMonto) {
        extraidos++;
        console.log(`     ✅ Regex monto: "${mMonto[0]}" → captura "${mMonto[1]}"`);
      } else {
        console.log(`     ❌ La regex de MONTO no encontró nada → en producción esto dispara el fallback de IA (lento).`);
      }
      console.log(`     ${mRef ? `✅ Regex referencia: "${mRef[1]}"` : "❌ Regex de referencia sin match"}`);
      console.log(`     Primeros 400 caracteres del texto plano (para calibrar la regex):`);
      console.log(`     «${texto.replace(/\s+/g, " ").trim().slice(0, 400)}»\n`);
    }
    console.log(`  Resumen: ${extraidos}/${uidsBanco.length} correos extraíbles por regex.`);
    if (extraidos < uidsBanco.length)
      info("Cada correo que la regex no extrae hace 1 llamada a la API de Claude. Con el timeout global de 8 s de banco.ts, varios fallbacks seguidos = 'tiempo de espera agotado'.");
  }
} finally {
  lock.release();
  await client.logout();
}
console.log("\n=== FIN DEL DIAGNÓSTICO ===\n");
