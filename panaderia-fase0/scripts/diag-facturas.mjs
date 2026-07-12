#!/usr/bin/env node
// Uso: node --env-file=.env scripts/diag-facturas.mjs
// Lista las últimas 20 facturas ordenadas por updatedAt desc para diagnosticar
// si se están marcando correctamente como PAGADAS tras un cierre.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const facturas = await prisma.facturaProveedor.findMany({
    take: 20,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      numero: true,
      fecha: true,
      estado: true,
      origenPago: true,
      cierreTurnoId: true,
      fechaPago: true,
      updatedAt: true,
      createdAt: true,
      proveedor: { select: { nombre: true } },
    },
  });

  console.log("\n=== Últimas 20 facturas (por updatedAt desc) ===\n");
  for (const f of facturas) {
    const estado = f.estado === "PAGADA" ? "\x1b[32mPAGADA\x1b[0m" : "\x1b[33mPENDIENTE\x1b[0m";
    console.log(`ID: ${f.id}`);
    console.log(`  Número:        ${f.numero ?? "(sin número)"}`);
    console.log(`  Proveedor:     ${f.proveedor.nombre}`);
    console.log(`  Fecha factura: ${f.fecha.toISOString().slice(0, 10)}`);
    console.log(`  Estado:        ${estado}`);
    console.log(`  OrigenPago:    ${f.origenPago ?? "(null)"}`);
    console.log(`  CierreTurnoId: ${f.cierreTurnoId ?? "(null)"}`);
    console.log(`  FechaPago:     ${f.fechaPago?.toISOString() ?? "(null)"}`);
    console.log(`  CreatedAt:     ${f.createdAt.toISOString()}`);
    console.log(`  UpdatedAt:     ${f.updatedAt.toISOString()}`);
    console.log("");
  }

  // Resumen: facturas PENDIENTES con cierreTurnoId (huérfanas — bug!)
  const huerfanas = await prisma.facturaProveedor.findMany({
    where: { estado: "PENDIENTE", cierreTurnoId: { not: null } },
    select: { id: true, cierreTurnoId: true, proveedor: { select: { nombre: true } } },
  });
  if (huerfanas.length > 0) {
    console.log(`\x1b[31m⚠️  HUÉRFANAS: ${huerfanas.length} factura(s) PENDIENTE con cierreTurnoId no nulo:\x1b[0m`);
    for (const h of huerfanas) {
      console.log(`  ${h.id} (${h.proveedor.nombre}) → cierre ${h.cierreTurnoId}`);
    }
    console.log("");
  } else {
    console.log("\x1b[32m✓ No hay facturas huérfanas (PENDIENTE con cierreTurnoId).\x1b[0m\n");
  }
} finally {
  await prisma.$disconnect();
}
