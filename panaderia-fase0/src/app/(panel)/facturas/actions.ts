"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recalcularCierre } from "@/lib/recalculo";
import { registrarAuditoria } from "@/lib/auditoria";
import { calcularTotalesFactura } from "@/lib/facturas";
import { zMonto, zCantidad } from "@/lib/decimales";

export type EstadoFactura = { ok: boolean; mensaje: string } | null;

// ── Schemas ─────────────────────────────────────────────────────────────────

const lineaSchema = z
  .object({
    insumoId: z.string().optional(),
    insumoNuevo: z
      .object({
        nombre: z.string().min(1, "El nombre del insumo es requerido"),
        unidadMedida: z.string().min(1, "La unidad de medida es requerida"),
      })
      .optional(),
    cantidad: zCantidad(3),
    costoTotal: zMonto,
  })
  .refine((d) => d.insumoId || d.insumoNuevo, {
    message: "Cada línea debe tener un insumo seleccionado o nuevo",
  });

const crearFacturaSchema = z
  .object({
    proveedorId: z.string().optional(),
    proveedorNuevo: z
      .object({
        nombre: z.string().min(1, "El nombre del proveedor es requerido"),
        contacto: z.string().nullable().optional(),
        telefono: z.string().nullable().optional(),
      })
      .optional(),
    sucursalId: z.string().min(1, "Elige la sucursal"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida"),
    numero: z.string().nullable().optional(),
    lineas: z.array(lineaSchema).min(1, "Agrega al menos una línea"),
    aplicaIva: z.coerce.boolean().default(false),
    // Campos opcionales para el flujo de escaneo IA (compatibles con registro manual)
    origenRegistro: z.enum(["MANUAL", "ESCANEO_IA"]).optional(),
    imagenUrl: z.string().nullable().optional(),
    datosIaJson: z.unknown().optional(),
  })
  .refine((d) => d.proveedorId || d.proveedorNuevo, {
    message: "Elige o crea un proveedor",
  });

// ── Crear factura ─────────────────────────────────────────────────────────────

export async function crearFactura(
  _prev: EstadoFactura,
  formData: FormData
): Promise<EstadoFactura> {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "ATENCION_CLIENTE")) {
    return { ok: false, mensaje: "No tienes permiso para registrar facturas." };
  }

  let payloadCrudo: unknown;
  try {
    payloadCrudo = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { ok: false, mensaje: "El formulario llegó incompleto. Intenta de nuevo." };
  }

  const parsed = crearFacturaSchema.safeParse(payloadCrudo);
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Resolver o crear proveedor
      let proveedorId: string;
      if (d.proveedorId) {
        proveedorId = d.proveedorId;
      } else {
        const prov = await tx.proveedor.create({
          data: {
            nombre: d.proveedorNuevo!.nombre,
            contacto: d.proveedorNuevo!.contacto ?? null,
            telefono: d.proveedorNuevo!.telefono ?? null,
          },
        });
        proveedorId = prov.id;
      }

      // Resolver o crear insumos y construir líneas
      const compras: Array<{
        insumoId: string;
        cantidad: number;
        costoTotal: number;
        costoUnitario: number;
      }> = [];

      for (const linea of d.lineas) {
        let insumoId: string;
        if (linea.insumoId) {
          insumoId = linea.insumoId;
        } else {
          const ins = await tx.insumo.create({
            data: {
              nombre: linea.insumoNuevo!.nombre,
              unidadMedida: linea.insumoNuevo!.unidadMedida,
            },
          });
          insumoId = ins.id;
        }
        const costoUnitario = Math.round((linea.costoTotal / linea.cantidad) * 10000) / 10000;
        compras.push({ insumoId, cantidad: linea.cantidad, costoTotal: linea.costoTotal, costoUnitario });
      }

      const { subtotal, iva, montoTotal } = calcularTotalesFactura(compras, d.aplicaIva);

      await tx.facturaProveedor.create({
        data: {
          proveedorId,
          sucursalId: d.sucursalId,
          numero: d.numero ?? null,
          fecha: new Date(d.fecha + "T00:00:00-05:00"),
          montoTotal,
          aplicaIva: d.aplicaIva,
          subtotal,
          iva,
          estado: "PENDIENTE",
          origenRegistro: d.origenRegistro ?? "MANUAL",
          imagenUrl: d.imagenUrl ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(d.datosIaJson !== undefined && { datosIaJson: d.datosIaJson as any }),
          registradaPorId: session.user!.id!,
          compras: { create: compras },
        },
      });
    });
  } catch {
    return { ok: false, mensaje: "No se pudo guardar la factura. Intenta de nuevo." };
  }

  revalidatePath("/facturas");
  revalidatePath("/caja");
  redirect("/facturas?guardado=1");
}

// ── Pagar factura (jefe, fuera de caja) ──────────────────────────────────────

export async function pagarFacturaJefe(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || session.user.rol !== "ADMIN") {
    redirect("/facturas?error=permiso");
  }

  const facturaId = String(formData.get("facturaId") ?? "");
  if (!facturaId) redirect("/facturas");

  await prisma.facturaProveedor.updateMany({
    where: { id: facturaId, estado: "PENDIENTE" },
    data: {
      estado: "PAGADA",
      origenPago: "JEFE",
      pagadaPorId: session.user!.id!,
      fechaPago: new Date(),
    },
  });

  revalidatePath("/facturas");
  redirect("/facturas?pagado=1");
}

// ── Anular factura ────────────────────────────────────────────────────────────

export async function anularFactura(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || session.user.rol !== "ADMIN") {
    redirect("/facturas?error=permiso");
  }
  const adminId = session.user.id!;

  const facturaId = String(formData.get("facturaId") ?? "");
  if (!facturaId) redirect("/facturas");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const factura = await tx.facturaProveedor.findUniqueOrThrow({
      where: { id: facturaId },
      select: { estado: true, origenPago: true, cierreTurnoId: true },
    });

    if (factura.estado === "ANULADA") return;

    const cierreTurnoId = factura.origenPago === "CAJA_TURNO" ? factura.cierreTurnoId : null;

    await tx.facturaProveedor.update({
      where: { id: facturaId },
      data: {
        estado: "ANULADA",
        ...(cierreTurnoId ? { origenPago: null, pagadaPorId: null, fechaPago: null, cierreTurnoId: null } : {}),
      },
    });

    await registrarAuditoria(tx, {
      entidad: "FacturaProveedor",
      entidadId: facturaId,
      accion: "ANULAR",
      cambios: [{ campo: "estado", valorAnterior: factura.estado, valorNuevo: "ANULADA" }],
      userId: adminId,
    });

    if (cierreTurnoId) {
      await recalcularCierre(tx, cierreTurnoId);
    }
  });

  revalidatePath("/facturas");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect("/facturas?anulada=1");
}

// ── Editar factura ────────────────────────────────────────────────────────────

const editarFacturaSchema = z.object({
  id: z.string().min(1),
  proveedorId: z.string().min(1, "Elige el proveedor."),
  sucursalId: z.string().min(1, "Elige la sucursal."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  numero: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  aplicaIva: z.coerce.boolean().default(false),
  lineas: z.array(
    z.object({
      insumoId: z.string().min(1, "Elige el insumo."),
      cantidad: zCantidad(3),
      costoTotal: zMonto,
    })
  ).min(1, "Agrega al menos una línea."),
});

export async function editarFactura(
  _prev: EstadoFactura,
  formData: FormData
): Promise<EstadoFactura> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, mensaje: "No autenticado." };
  const userId = session.user.id!;
  const esAdmin = session.user.rol === "ADMIN";

  let payloadCrudo: unknown;
  try {
    payloadCrudo = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { ok: false, mensaje: "El formulario llegó incompleto." };
  }

  const parsed = editarFacturaSchema.safeParse(payloadCrudo);
  if (!parsed.success) return { ok: false, mensaje: parsed.error.errors[0].message };
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const actual = await tx.facturaProveedor.findUniqueOrThrow({
        where: { id: d.id },
        include: { compras: true },
      });

      // Permisos por estado
      if (actual.estado === "ANULADA") throw new Error("Las facturas anuladas no se pueden editar.");
      if (actual.estado === "PAGADA" && !esAdmin) throw new Error("Solo el administrador puede editar facturas pagadas.");
      if (actual.estado === "PENDIENTE" && !esAdmin && actual.registradaPorId !== userId) {
        throw new Error("Solo puedes editar facturas que registraste tú.");
      }

      // Recalcular totales con IVA
      const comprasNuevas: Array<{ insumoId: string; cantidad: number; costoTotal: number; costoUnitario: number }> = [];
      for (const linea of d.lineas) {
        const costoUnitario = Math.round((linea.costoTotal / linea.cantidad) * 10000) / 10000;
        comprasNuevas.push({ insumoId: linea.insumoId, cantidad: linea.cantidad, costoTotal: linea.costoTotal, costoUnitario });
      }
      const { subtotal, iva, montoTotal } = calcularTotalesFactura(comprasNuevas, d.aplicaIva);

      // Cambios para auditoría
      const cambios: Array<{ campo: string; valorAnterior: string; valorNuevo: string }> = [];
      if (actual.proveedorId !== d.proveedorId) cambios.push({ campo: "proveedorId", valorAnterior: actual.proveedorId, valorNuevo: d.proveedorId });
      if (actual.sucursalId !== d.sucursalId) cambios.push({ campo: "sucursalId", valorAnterior: actual.sucursalId, valorNuevo: d.sucursalId });
      const fechaAnterior = actual.fecha.toISOString().slice(0, 10);
      if (fechaAnterior !== d.fecha) cambios.push({ campo: "fecha", valorAnterior: fechaAnterior, valorNuevo: d.fecha });
      if ((actual.numero ?? null) !== d.numero) cambios.push({ campo: "numero", valorAnterior: actual.numero ?? "(vacío)", valorNuevo: d.numero ?? "(vacío)" });
      if (actual.aplicaIva !== d.aplicaIva) cambios.push({ campo: "aplicaIva", valorAnterior: String(actual.aplicaIva), valorNuevo: String(d.aplicaIva) });
      if (Number(actual.montoTotal) !== montoTotal) cambios.push({ campo: "montoTotal", valorAnterior: String(Number(actual.montoTotal)), valorNuevo: String(montoTotal) });

      // Reemplazar compras
      await tx.compraInsumo.deleteMany({ where: { facturaId: d.id } });
      await tx.facturaProveedor.update({
        where: { id: d.id },
        data: {
          proveedorId: d.proveedorId,
          sucursalId: d.sucursalId,
          fecha: new Date(d.fecha + "T00:00:00-05:00"),
          numero: d.numero,
          montoTotal,
          aplicaIva: d.aplicaIva,
          subtotal,
          iva,
          compras: { create: comprasNuevas },
        },
      });

      if (cambios.length > 0) {
        await registrarAuditoria(tx, { entidad: "FacturaProveedor", entidadId: d.id, accion: "EDITAR", cambios, userId });
      }

      // Si era PAGADA desde caja y cambió el monto → recalcular cierre
      if (actual.estado === "PAGADA" && actual.origenPago === "CAJA_TURNO" && actual.cierreTurnoId && Number(actual.montoTotal) !== montoTotal) {
        await recalcularCierre(tx, actual.cierreTurnoId);
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    return { ok: false, mensaje: msg || "No se pudo guardar la factura." };
  }

  revalidatePath("/facturas");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect("/facturas?editada=1");
}

// ── Revertir pago de factura ──────────────────────────────────────────────────

export async function revertirPagoFactura(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || session.user.rol !== "ADMIN") {
    redirect("/facturas?error=permiso");
  }
  const adminId = session.user.id!;

  const facturaId = String(formData.get("facturaId") ?? "");
  if (!facturaId) redirect("/facturas");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const factura = await tx.facturaProveedor.findUniqueOrThrow({
      where: { id: facturaId },
      select: { estado: true, origenPago: true, cierreTurnoId: true },
    });

    if (factura.estado !== "PAGADA") throw new Error("Solo se puede revertir el pago de facturas pagadas.");

    const cierreTurnoId = factura.origenPago === "CAJA_TURNO" ? factura.cierreTurnoId : null;

    await tx.facturaProveedor.update({
      where: { id: facturaId },
      data: {
        estado: "PENDIENTE",
        origenPago: null,
        pagadaPorId: null,
        fechaPago: null,
        cierreTurnoId: null,
      },
    });

    await registrarAuditoria(tx, {
      entidad: "FacturaProveedor",
      entidadId: facturaId,
      accion: "REVERTIR_PAGO",
      cambios: [{ campo: "estado", valorAnterior: "PAGADA", valorNuevo: "PENDIENTE" }],
      userId: adminId,
    });

    if (cierreTurnoId) {
      await recalcularCierre(tx, cierreTurnoId);
    }
  });

  revalidatePath("/facturas");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect("/facturas?revertida=1");
}
