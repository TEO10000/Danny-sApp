import type { Prisma } from "@prisma/client";

type ClienteAuditoria = Prisma.TransactionClient | typeof import("@/lib/prisma").prisma;

type Cambio = {
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
};

type OpcionesAuditoria = {
  entidad: string;
  entidadId: string;
  accion: string;
  cambios?: Cambio[];
  userId: string;
};

export async function registrarAuditoria(
  tx: ClienteAuditoria,
  { entidad, entidadId, accion, cambios, userId }: OpcionesAuditoria
) {
  if (cambios && cambios.length > 0) {
    await (tx as Prisma.TransactionClient).auditLog.createMany({
      data: cambios.map((c) => ({
        entidad,
        entidadId,
        accion,
        campo: c.campo,
        valorAnterior: c.valorAnterior,
        valorNuevo: c.valorNuevo,
        userId,
      })),
    });
  } else {
    await (tx as Prisma.TransactionClient).auditLog.create({
      data: { entidad, entidadId, accion, userId },
    });
  }
}
