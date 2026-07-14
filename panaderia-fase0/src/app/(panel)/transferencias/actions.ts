"use server";

import { createHash } from "crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { zMonto } from "@/lib/decimales";
import { revalidatePath } from "next/cache";

function hashCorto(crudo: string): string {
  return createHash("sha256").update(crudo).digest("hex").slice(0, 8);
}

const esquemaRegistro = z.object({
  sucursalId: z.string().min(1),
  monto: zMonto,
  crudo: z.string().min(1),
  comprobante: z.string().optional(),
  uuid: z.string().optional(),      // UUID del comprobante Deuna — prioridad máxima para idempotencia
  pagador: z.string().optional(),
  beneficiario: z.string().optional(),
});

export type ResultadoRegistro =
  | { ok: true }
  | { ok: false; error: string }
  | { duplicada: true; hora: string };

export async function registrarTransferenciaQR(
  input: unknown
): Promise<ResultadoRegistro> {
  const sesion = await auth();
  if (!sesion?.user) return { ok: false, error: "No autenticado" };
  const rol = sesion.user.rol ?? "";
  if (rol !== "ATENCION_CLIENTE" && rol !== "ADMIN") {
    return { ok: false, error: "Sin permisos" };
  }

  const parsed = esquemaRegistro.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? "Datos inválidos";
    return { ok: false, error: msg };
  }

  const { sucursalId, monto, crudo, comprobante, uuid, pagador, beneficiario } = parsed.data;

  const sucursal = await prisma.sucursal.findUnique({ where: { id: sucursalId } });
  if (!sucursal) return { ok: false, error: "Sucursal no encontrada" };

  // Idempotencia: UUID > comprobante > hash corto del crudo
  const messageId = `qr:${uuid ?? comprobante ?? hashCorto(crudo)}`;

  const existente = await prisma.transferenciaTurno.findUnique({
    where: { messageId },
    select: { id: true, createdAt: true },
  });
  if (existente) {
    const hora = new Intl.DateTimeFormat("es-EC", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Guayaquil",
      hour12: false,
    }).format(existente.createdAt);
    return { duplicada: true, hora };
  }

  // La hora guardada es siempre el momento del escaneo (cae en la franja del turno activo)
  const hora = new Date();
  const montoRedondeado = Math.round(monto * 100) / 100;

  await prisma.transferenciaTurno.create({
    data: {
      sucursalId,
      monto: montoRedondeado,
      referencia: comprobante ?? null,
      remitente: pagador ?? null,
      beneficiario: beneficiario ?? null,
      hora,
      messageId,
      estado: "SUGERIDA",
      origen: "QR",
      registradaPorId: sesion.user.id ?? null,
      qrCrudo: crudo,
    },
  });

  revalidatePath("/transferencias");
  return { ok: true };
}
