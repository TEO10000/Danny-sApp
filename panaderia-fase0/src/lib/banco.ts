import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { extraerConRegex, extraerConIA, extraerDeuna } from "./banco-parser";
import { prisma } from "./prisma";

// Variables de entorno requeridas:
// BANCO_IMAP_USER_PRINCIPAL / BANCO_IMAP_PASS_PRINCIPAL
// BANCO_IMAP_USER_CONSEJO   / BANCO_IMAP_PASS_CONSEJO   (opcional)
// BANCO_REMITENTE (default "pichincha.com")

interface CredencialesIMAP {
  user: string;
  pass: string;
}

const REMITENTES = [
  { dominio: "deunaapp.com", canal: "DEUNA" as const },
  { dominio: process.env.BANCO_REMITENTE ?? "pichincha.com", canal: "PICHINCHA" as const },
];

type Canal = "DEUNA" | "PICHINCHA";

// Asuntos que nunca corresponden a un abono recibido
const LISTA_NEGRA = [
  "inicio de sesion", "clave", "contrasena", "seguridad",
  "mantenimiento", "transferencia enviada", "transferencia realizada",
  "pago realizado", "debito", "consumo", "bloqueo", "actualiza",
];

// Para Deuna: basta con "recibiste" en el asunto
// Para Pichincha: debe contener alguna de estas palabras
const PUERTA_PICHINCHA = ["recib", "acredit", "deposito", "abono", "credito"];

export function normalizarMessageId(s: string): string {
  return s.replace(/^<|>$/g, "").trim();
}

function normalizarAsunto(asunto: string): string {
  return asunto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function descartarPorAsunto(asunto: string, canal: Canal): boolean {
  const norm = normalizarAsunto(asunto);
  // Lista negra: siempre descartar
  if (LISTA_NEGRA.some((p) => norm.includes(p))) return true;
  // Puerta positiva por canal
  if (canal === "DEUNA") {
    return !norm.includes("recibiste");
  }
  if (canal === "PICHINCHA") {
    return !PUERTA_PICHINCHA.some((p) => norm.includes(p));
  }
  return true;
}

function limpiarHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function credencialesPara(sucursalNombre: string): CredencialesIMAP | null {
  const nombre = sucursalNombre.toLowerCase();
  if (nombre.includes("principal")) {
    const user = process.env.BANCO_IMAP_USER_PRINCIPAL;
    const pass = process.env.BANCO_IMAP_PASS_PRINCIPAL;
    if (user && pass) return { user, pass };
  } else if (nombre.includes("consejo")) {
    const user = process.env.BANCO_IMAP_USER_CONSEJO;
    const pass = process.env.BANCO_IMAP_PASS_CONSEJO;
    if (user && pass) return { user, pass };
  }
  return null;
}

export interface TransferenciaLeida {
  messageId: string;
  monto: number;
  referencia?: string;
  remitente?: string;
  hora?: Date;
}

export type ResultadoLectura =
  | { ok: true; transferencias: TransferenciaLeida[] }
  | { ok: false; motivo: string };

export async function leerTransferencias(
  sucursalNombre: string,
  desde: Date | null,
  hasta: Date
): Promise<ResultadoLectura> {
  const creds = credencialesPara(sucursalNombre);
  if (!creds) {
    return { ok: false, motivo: "buzón de correo no configurado para esta sucursal" };
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });

  const timeout = new Promise<ResultadoLectura>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 12000)
  );

  const lectura = async (): Promise<ResultadoLectura> => {
    try {
      await client.connect();
      await client.getMailboxLock("INBOX");

      // Ventana IMAP con 1 día de margen (UTC vs UTC-5)
      const desdeBusqueda = new Date(desde ? desde.getTime() - 86400000 : hasta.getTime() - 30 * 86400000);

      // ── PASE 1: recolectar ENVELOPEs de todos los remitentes ─────────────────

      type InfoMensaje = {
        uid: number;
        messageId: string;
        subject: string;
        fromAddr: string;
        date: Date | undefined;
        canal: Canal;
      };

      const infoMap = new Map<number, InfoMensaje>();

      for (const rem of REMITENTES) {
        let uids: number[] = [];
        try {
          const result = await client.search(
            { since: desdeBusqueda, from: rem.dominio },
            { uid: true }
          );
          uids = Array.isArray(result) ? result : [];
        } catch {
          continue;
        }
        if (uids.length === 0) continue;

        try {
          for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
            if (!msg.envelope) continue;
            const uid = msg.uid;
            if (infoMap.has(uid)) continue; // ya procesado por otro remitente
            infoMap.set(uid, {
              uid,
              messageId: normalizarMessageId(msg.envelope.messageId ?? `uid-${uid}-${Date.now()}`),
              subject: msg.envelope.subject ?? "",
              fromAddr: msg.envelope.from?.[0]?.address ?? "",
              date: msg.envelope.date,
              canal: rem.canal,
            });
          }
        } catch {
          continue;
        }
      }

      const todosInfo = Array.from(infoMap.values());
      if (todosInfo.length === 0) {
        console.log("[banco] resumen: total=0 / ya_registrados=0 / descartados=0 / regex=0 / ia=0 / sin_datos=0");
        return { ok: true, transferencias: [] };
      }

      // ── SALTAR ya-registrados ─────────────────────────────────────────────────

      const todosMessageIds = todosInfo.map((i) => i.messageId);
      const yaRegistrados = await prisma.transferenciaTurno.findMany({
        where: { messageId: { in: todosMessageIds } },
        select: { messageId: true },
      });
      const yaRegistradosSet = new Set(
        yaRegistrados.flatMap((t) => t.messageId != null ? [normalizarMessageId(t.messageId)] : [])
      );

      const candidatos = todosInfo.filter((i) => !yaRegistradosSet.has(i.messageId));
      const countYaReg = todosInfo.length - candidatos.length;

      // ── FILTRO por asunto y ventana de fechas ─────────────────────────────────

      const candidatosFiltrados = candidatos.filter((info) => {
        // Filtrar por ventana horaria usando la fecha del envelope
        if (info.date) {
          if (desde && info.date <= desde) return false;
          if (info.date > hasta) return false;
        }
        // Filtrar por asunto
        return !descartarPorAsunto(info.subject, info.canal);
      });
      const countDescartados = candidatos.length - candidatosFiltrados.length;

      // ── PASE 2: descargar cuerpos de candidatos sobrevivientes ───────────────

      const transferencias: TransferenciaLeida[] = [];
      let countRegex = 0;
      let countIA = 0;
      let countSinDatos = 0;
      let llamadasIA = 0;

      for (const info of candidatosFiltrados) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let msgFull: any;
        try {
          msgFull = await client.fetchOne(String(info.uid), { source: true }, { uid: true });
        } catch {
          countSinDatos++;
          continue;
        }
        if (!msgFull?.source) { countSinDatos++; continue; }

        let parsed: Awaited<ReturnType<typeof simpleParser>>;
        try {
          parsed = await simpleParser(msgFull.source);
        } catch {
          countSinDatos++;
          continue;
        }

        // Verificar dominio del remitente
        const fromStr = parsed.from?.text ?? "";
        const esDelCanal = info.canal === "DEUNA"
          ? fromStr.toLowerCase().includes("deunaapp.com")
          : fromStr.toLowerCase().includes((process.env.BANCO_REMITENTE ?? "pichincha.com").toLowerCase());
        if (!esDelCanal) { countSinDatos++; continue; }

        // Texto limpio
        const htmlTexto = typeof parsed.html === "string" ? limpiarHtml(parsed.html) : "";
        const textoPlano = parsed.text || htmlTexto || "";

        const fechaCorreo = parsed.date ?? info.date;

        // ── Enrutamiento por canal ──────────────────────────────────────────

        let datos = null;

        if (info.canal === "DEUNA") {
          datos = extraerDeuna(info.subject, textoPlano);
          if (datos) countRegex++;
          // Deuna no usa IA salvo fallo de extracción de monto
          if (!datos && llamadasIA < 5) {
            llamadasIA++;
            datos = await extraerConIA(textoPlano);
            if (datos) countIA++;
          }
        } else {
          // PICHINCHA: regex primero
          datos = extraerConRegex(textoPlano);
          if (datos) {
            countRegex++;
          } else if (llamadasIA < 5) {
            // Fallback IA
            llamadasIA++;
            datos = await extraerConIA(textoPlano);
            if (datos) countIA++;
          }
        }

        if (!datos) { countSinDatos++; continue; }

        transferencias.push({
          messageId: info.messageId,
          monto: datos.monto,
          referencia: datos.referencia,
          remitente: (datos.remitente ?? fromStr) || undefined,
          hora: datos.hora ?? fechaCorreo ?? undefined,
        });
      }

      const resumen = `total=${todosInfo.length} / ya_registrados=${countYaReg} / descartados=${countDescartados} / regex=${countRegex} / ia=${countIA} / sin_datos=${countSinDatos}`;
      console.log(`[banco] resumen: ${resumen}`);

      return { ok: true, transferencias };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "timeout") return { ok: false, motivo: "tiempo de espera agotado al conectar con el correo" };
      return { ok: false, motivo: `error de conexión: ${msg}` };
    } finally {
      try { client.logout(); } catch { /* nada */ }
    }
  };

  try {
    return await Promise.race([lectura(), timeout]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, motivo: msg === "timeout" ? "tiempo de espera agotado" : `error inesperado: ${msg}` };
  }
}
