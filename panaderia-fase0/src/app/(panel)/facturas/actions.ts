"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    cantidad: z.coerce.number().positive("La cantidad debe ser mayor a 0"),
    costoTotal: z.coerce.number().positive("El costo debe ser mayor a 0"),
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
    await prisma.$transaction(async (tx: typeof prisma) => {
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
      let montoTotal = 0;
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
        montoTotal += linea.costoTotal;
        compras.push({ insumoId, cantidad: linea.cantidad, costoTotal: linea.costoTotal, costoUnitario });
      }
      montoTotal = Math.round(montoTotal * 100) / 100;

      await tx.facturaProveedor.create({
        data: {
          proveedorId,
          sucursalId: d.sucursalId,
          numero: d.numero ?? null,
          fecha: new Date(d.fecha + "T00:00:00-05:00"),
          montoTotal,
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

  const facturaId = String(formData.get("facturaId") ?? "");
  if (!facturaId) redirect("/facturas");

  await prisma.facturaProveedor.updateMany({
    where: { id: facturaId, estado: "PENDIENTE" },
    data: { estado: "ANULADA" },
  });

  revalidatePath("/facturas");
  redirect("/facturas?anulada=1");
}
