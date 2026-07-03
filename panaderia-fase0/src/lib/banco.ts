import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { extraerConRegex, extraerConIA } from "./banco-parser";

// Variables de entorno requeridas:
// BANCO_IMAP_USER_PRINCIPAL / BANCO_IMAP_PASS_PRINCIPAL
// BANCO_IMAP_USER_CONSEJO   / BANCO_IMAP_PASS_CONSEJO   (opcional)
// BANCO_REMITENTE (default "pichincha.com")

interface CredencialesIMAP {
  user: string;
  pass: string;
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

  const filtroRemitente = process.env.BANCO_REMITENTE ?? "pichincha.com";

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });

  const timeout = new Promise<ResultadoLectura>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), 8000)
  );

  const lectura = async (): Promise<ResultadoLectura> => {
    try {
      await client.connect();
      await client.getMailboxLock("INBOX");

      // Margen de 1 día por el desfase UTC en IMAP SEARCH
      const desdeBusqueda = new Date(desde ? desde.getTime() - 86400000 : hasta.getTime() - 30 * 86400000);
      const desdeBusquedaStr = desdeBusqueda.toDateString();

      const uidsResult = await client.search({
        since: new Date(desdeBusquedaStr),
        from: filtroRemitente,
      });
      const uids: number[] = Array.isArray(uidsResult) ? uidsResult : [];

      const transferencias: TransferenciaLeida[] = [];

      for (const uid of uids) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let msg: any;
        try {
          msg = await client.fetchOne(String(uid), { source: true });
        } catch {
          continue;
        }
        if (!msg || !msg.source) continue;

        let parsed: Awaited<ReturnType<typeof simpleParser>>;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          continue;
        }

        // Filtro en código: hora del correo en ventana UTC-5
        const fechaCorreo = parsed.date;
        if (fechaCorreo) {
          const horaEC = new Date(fechaCorreo.getTime() - 5 * 3600000);
          const desdeEC = desde ? new Date(desde.getTime() - 5 * 3600000) : null;
          const hastaEC = new Date(hasta.getTime() - 5 * 3600000);
          if (desdeEC && horaEC <= desdeEC) continue;
          if (horaEC > hastaEC) continue;
        }

        // Filtro adicional: confirmar que viene del remitente del banco
        const from = parsed.from?.text ?? "";
        if (!from.toLowerCase().includes(filtroRemitente.toLowerCase())) continue;

        const msgId = typeof parsed.messageId === "string" ? parsed.messageId : `uid-${uid}-${Date.now()}`;
        const htmlTexto = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "";
        const textoPlano = parsed.text || htmlTexto || "";

        // Capa 1: regex
        let datos = extraerConRegex(textoPlano);

        // Capa 2: fallback IA si no se extrajo monto
        if (!datos) {
          datos = await extraerConIA(textoPlano);
        }

        if (!datos) continue;

        // Hora: usar la del correo si el parser no la extrajo del cuerpo
        const horaFinal = datos.hora ?? parsed.date ?? undefined;

        transferencias.push({
          messageId: msgId,
          monto: datos.monto,
          referencia: datos.referencia,
          remitente: datos.remitente ?? parsed.from?.text,
          hora: horaFinal,
        });
      }

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
