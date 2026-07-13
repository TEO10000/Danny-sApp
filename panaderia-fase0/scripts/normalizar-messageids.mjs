#!/usr/bin/env node
// Uso: node --env-file=.env scripts/normalizar-messageids.mjs
// Normaliza los messageId existentes en BD (quita < > y espacios).
// Si la normalización colisiona con otra fila: conserva CONFIRMADA (o la más antigua)
// y elimina la SUGERIDA duplicada sin cierre.
// Ejecutar una sola vez.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizarMessageId(s) {
  if (!s) return s;
  return s.replace(/^<|>$/g, "").trim();
}

try {
  const todas = await prisma.transferenciaTurno.findMany({
    select: { id: true, messageId: true, estado: true, cierreTurnoId: true, createdAt: true },
  });

  let tocadas = 0;
  let colisiones = 0;
  let eliminadas = 0;

  for (const fila of todas) {
    if (!fila.messageId) continue; // sin messageId, nada que normalizar
    const normalizado = normalizarMessageId(fila.messageId);
    if (normalizado === fila.messageId) continue; // ya normalizado

    // Verificar si ya existe una fila con el messageId normalizado
    const existente = await prisma.transferenciaTurno.findUnique({
      where: { messageId: normalizado },
      select: { id: true, estado: true, cierreTurnoId: true, createdAt: true },
    });

    if (existente) {
      colisiones++;
      // Conservar la CONFIRMADA o la más antigua; eliminar la SUGERIDA sin cierre
      const eliminarId =
        fila.estado === "CONFIRMADA" || (existente.estado !== "CONFIRMADA" && fila.createdAt <= existente.createdAt)
          ? existente.id
          : fila.id;
      const conservarId = eliminarId === fila.id ? existente.id : fila.id;
      console.log(
        `Colisión: conservando id=${conservarId}, eliminando id=${eliminarId} (estado=${eliminarId === fila.id ? fila.estado : existente.estado})`
      );
      await prisma.transferenciaTurno.delete({ where: { id: eliminarId } });
      // Si el conservado tiene el messageId sin normalizar, actualizarlo
      const conservado = eliminarId === fila.id ? existente : fila;
      if (normalizarMessageId(conservado.messageId) !== conservado.messageId) {
        await prisma.transferenciaTurno.update({
          where: { id: conservarId },
          data: { messageId: normalizado },
        });
        tocadas++;
      }
      eliminadas++;
    } else {
      await prisma.transferenciaTurno.update({
        where: { id: fila.id },
        data: { messageId: normalizado },
      });
      tocadas++;
    }
  }

  console.log(`\nResumen: total=${todas.length} / tocadas=${tocadas} / colisiones=${colisiones} / eliminadas=${eliminadas}`);
} catch (err) {
  console.error("Error:", err.message);
} finally {
  await prisma.$disconnect();
}
