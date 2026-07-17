"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { hoyEcuador } from "@/lib/cierres";
import { recalcularCierre, cierreQueContieneTimestamp } from "@/lib/recalculo";
import { registrarAuditoria } from "@/lib/auditoria";
import { preciosVigentesEn } from "@/lib/catalogo";
import { produccionBruta, unidadesBuenas } from "@/lib/produccion-calculo";

const detalleLatasSchema = z.object({
  productoId: z.string().min(1, "Elige el pan de cada fila."),
  modo: z.literal("LATAS"),
  numLatas: z.coerce.number().int().min(1, "Cada fila necesita al menos 1 lata."),
  panesPorLata: z.coerce.number().int().min(1, "Indica cuántos panes salen por lata."),
  mermas: z.coerce.number().int().min(0).default(0),
});

const detalleUnidadesSchema = z.object({
  productoId: z.string().min(1, "Elige el producto de cada fila."),
  modo: z.literal("UNIDADES"),
  cantidadUnidades: z.coerce.number().int().min(1, "Indica cuántas unidades se produjeron."),
  mermas: z.coerce.number().int().min(0).default(0),
});

const detalleSchema = z.discriminatedUnion("modo", [detalleLatasSchema, detalleUnidadesSchema]);

const cocheSchema = z.object({
  sucursalId: z.string().min(1, "Elige la sucursal de destino."),
  fecha: z.string().min(1, "Elige la fecha."),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora de salida del horno."),
  notas: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  detalles: z.array(detalleSchema).min(1, "Agrega al menos un pan al coche."),
});

export type EstadoCoche = { ok: boolean; mensaje: string } | null;

// Tipos locales para los campos añadidos en la migración produccion_modo_flexible,
// que el cliente Prisma generado puede no tener hasta hacer `prisma generate`.
type DetalleRaw = {
  id: string;
  productoId: string;
  numLatas: number | null;
  panesPorLata: number | null;
  cantidadUnidades: number | null;
  mermas: number;
  agotado: boolean;
  agotadoEn: Date | null;
  producto: { nombre: string; vidaUtilHoras: number | null; categoria: string };
};

type AuditLogRaw = {
  id: string;
  fecha: Date;
  accion: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  user: { nombre: string };
};

export async function obtenerDetalleCoche(cocheId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("No autorizado.");

  const [coche, auditLogs] = await Promise.all([
    prisma.cocheProduccion.findUniqueOrThrow({
      where: { id: cocheId },
      include: {
        sucursal: { select: { nombre: true } },
        panadero: { select: { nombre: true } },
        detalles: {
          include: { producto: { select: { nombre: true, vidaUtilHoras: true, categoria: true } } },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { entidad: "CocheProduccion", entidadId: cocheId },
      orderBy: { fecha: "desc" },
      include: { user: { select: { nombre: true } } },
    }),
  ]);

  const detalles = (coche.detalles as unknown as DetalleRaw[]).map((detalle) => {
    const subtotal = produccionBruta({
      numLatas: detalle.numLatas,
      panesPorLata: detalle.panesPorLata,
      cantidadUnidades: detalle.cantidadUnidades,
      mermas: detalle.mermas,
    });
    const buenos = unidadesBuenas({
      numLatas: detalle.numLatas,
      panesPorLata: detalle.panesPorLata,
      cantidadUnidades: detalle.cantidadUnidades,
      mermas: detalle.mermas,
    });
    return {
      detalleId: detalle.id,
      productoId: detalle.productoId,
      producto: {
        nombre: detalle.producto.nombre,
        vidaUtilHoras: detalle.producto.vidaUtilHoras,
        categoria: detalle.producto.categoria,
      },
      modo: detalle.cantidadUnidades != null ? ("UNIDADES" as const) : ("LATAS" as const),
      numLatas: detalle.numLatas,
      panesPorLata: detalle.panesPorLata,
      cantidadUnidades: detalle.cantidadUnidades,
      mermas: detalle.mermas,
      agotado: detalle.agotado,
      agotadoEn: detalle.agotadoEn?.toISOString() ?? null,
      subtotal,
      buenos,
    };
  });

  const latasTotales = detalles.reduce((s, d) => s + (d.modo === "LATAS" ? (d.numLatas ?? 0) : 0), 0);
  const panesTotales = detalles.reduce((s, d) => s + d.subtotal, 0);
  const mermasTotales = detalles.reduce((s, d) => s + d.mermas, 0);

  const puedeEditar =
    session.user.rol === "ADMIN" ||
    (session.user.rol === "PANADERO" && coche.panaderoId === session.user.id);

  const historial = (auditLogs as unknown as AuditLogRaw[]).map((log) => ({
    id: log.id,
    fecha: log.fecha.toISOString(),
    usuario: log.user.nombre,
    accion: log.accion,
    campo: log.campo,
    valorAnterior: log.valorAnterior,
    valorNuevo: log.valorNuevo,
  }));

  const base = {
    id: coche.id,
    fecha: coche.fecha.toISOString(),
    sucursal: { nombre: coche.sucursal.nombre },
    panadero: { nombre: coche.panadero.nombre },
    notas: coche.notas,
    detalles,
    latasTotales,
    panesTotales,
    mermasTotales,
    puedeEditar,
    historial,
  };

  if (session.user.rol === "ADMIN") {
    const precios = await preciosVigentesEn(coche.fecha);
    const ingresoEstimado = detalles.reduce((s, detalle) => {
      const precio = precios.get(detalle.productoId) ?? 0;
      return s + detalle.buenos * precio;
    }, 0);
    return { ...base, ingresoEstimado: Math.round(ingresoEstimado * 100) / 100 };
  }

  return base;
}

export async function registrarCoche(
  _prev: EstadoCoche,
  formData: FormData
): Promise<EstadoCoche> {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "PANADERO")) {
    return { ok: false, mensaje: "No tienes permiso para registrar producción." };
  }

  let detallesCrudos: unknown;
  try {
    detallesCrudos = JSON.parse(String(formData.get("detalles") ?? "[]"));
  } catch {
    return { ok: false, mensaje: "Los datos del coche llegaron incompletos. Intenta de nuevo." };
  }

  const parsed = cocheSchema.safeParse({
    sucursalId: formData.get("sucursalId"),
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    notas: formData.get("notas") ?? "",
    detalles: detallesCrudos,
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  const productos = await prisma.producto.findMany({
    where: { id: { in: parsed.data.detalles.map((d) => d.productoId) } },
    select: { id: true, nombre: true, modoProduccion: true },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  for (const d of parsed.data.detalles) {
    const producto = porId.get(d.productoId);
    if (!producto) {
      return { ok: false, mensaje: "El producto seleccionado no existe." };
    }
    if (producto.modoProduccion !== d.modo) {
      return {
        ok: false,
        mensaje: `El producto ${producto.nombre} se produce por ${producto.modoProduccion === "UNIDADES" ? "unidades" : "latas"}, no por ${d.modo === "UNIDADES" ? "unidades" : "latas"}.`,
      };
    }
    const producidas = produccionBruta({
      numLatas: d.modo === "LATAS" ? d.numLatas : null,
      panesPorLata: d.modo === "LATAS" ? d.panesPorLata : null,
      cantidadUnidades: d.modo === "UNIDADES" ? d.cantidadUnidades : null,
      mermas: d.mermas,
    });
    if (d.mermas > producidas) {
      return { ok: false, mensaje: "Las mermas de una fila superan lo producido." };
    }
  }

  // Fecha y hora reales en Ecuador: con la hora, cada coche se atribuye
  // al turno correcto en el cierre de caja (T1 hasta las 14:00, T2 después).
  const fecha = new Date(`${parsed.data.fecha}T${parsed.data.hora}:00-05:00`);
  if (Number.isNaN(fecha.getTime())) {
    return { ok: false, mensaje: "La fecha no es válida." };
  }

  await prisma.cocheProduccion.create({
    data: {
      fecha,
      sucursalId: parsed.data.sucursalId,
      panaderoId: session.user.id,
      notas: parsed.data.notas,
      detalles: {
        create: parsed.data.detalles.map((d) =>
          d.modo === "LATAS"
            ? {
                productoId: d.productoId,
                numLatas: d.numLatas,
                panesPorLata: d.panesPorLata,
                cantidadUnidades: null,
                mermas: d.mermas,
              }
            : {
                productoId: d.productoId,
                numLatas: null,
                panesPorLata: null,
                cantidadUnidades: d.cantidadUnidades,
                mermas: d.mermas,
              }
        ),
      },
    },
  });

  revalidatePath("/produccion");
  redirect("/produccion?guardado=1");
}

export async function marcarAgotado(detalleId: string, agotado: boolean) {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "PANADERO")) {
    throw new Error("No tienes permiso para actualizar producción.");
  }

  // No afecta ventas ni cierres: solo silencia la alerta de vencimiento para esta línea.
  await prisma.detalleCoche.update({
    where: { id: detalleId },
    data: { agotado, agotadoEn: agotado ? new Date() : null },
  });

  revalidatePath("/produccion");
}

export async function editarCoche(
  _prev: EstadoCoche,
  formData: FormData
): Promise<EstadoCoche> {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "PANADERO")) {
    return { ok: false, mensaje: "No tienes permiso para editar producción." };
  }
  const userId = session.user.id;

  const cocheId = String(formData.get("cocheId") ?? "");
  if (!cocheId) return { ok: false, mensaje: "ID de coche inválido." };

  let detallesCrudos: unknown;
  try {
    detallesCrudos = JSON.parse(String(formData.get("detalles") ?? "[]"));
  } catch {
    return { ok: false, mensaje: "Los datos del coche llegaron incompletos." };
  }

  const parsed = cocheSchema.safeParse({
    sucursalId: formData.get("sucursalId"),
    fecha: formData.get("fecha"),
    hora: formData.get("hora"),
    notas: formData.get("notas") ?? "",
    detalles: detallesCrudos,
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  const productos = await prisma.producto.findMany({
    where: { id: { in: parsed.data.detalles.map((d) => d.productoId) } },
    select: { id: true, nombre: true, modoProduccion: true },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  for (const d of parsed.data.detalles) {
    const producto = porId.get(d.productoId);
    if (!producto) {
      return { ok: false, mensaje: "El producto seleccionado no existe." };
    }
    if (producto.modoProduccion !== d.modo) {
      return {
        ok: false,
        mensaje: `El producto ${producto.nombre} se produce por ${producto.modoProduccion === "UNIDADES" ? "unidades" : "latas"}, no por ${d.modo === "UNIDADES" ? "unidades" : "latas"}.`,
      };
    }
    const producidas = produccionBruta({
      numLatas: d.modo === "LATAS" ? d.numLatas : null,
      panesPorLata: d.modo === "LATAS" ? d.panesPorLata : null,
      cantidadUnidades: d.modo === "UNIDADES" ? d.cantidadUnidades : null,
      mermas: d.mermas,
    });
    if (d.mermas > producidas) {
      return { ok: false, mensaje: "Las mermas de una fila superan lo producido." };
    }
  }

  const nuevaFecha = new Date(`${parsed.data.fecha}T${parsed.data.hora}:00-05:00`);
  if (Number.isNaN(nuevaFecha.getTime())) {
    return { ok: false, mensaje: "La fecha no es válida." };
  }

  let cierresAfectadosIds: string[] = [];

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cocheActual = await tx.cocheProduccion.findUniqueOrThrow({
        where: { id: cocheId },
        include: { detalles: true },
      });

      // Permisos: PANADERO solo sus coches de hoy
      if (rol === "PANADERO") {
        if (cocheActual.panaderoId !== userId) {
          throw new Error("PERMISO: solo puedes editar tus propios coches.");
        }
        const cocheEnEcuador = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Guayaquil",
        }).format(cocheActual.fecha);
        if (cocheEnEcuador !== hoyEcuador()) {
          throw new Error("PERMISO: solo puedes editar coches del día de hoy.");
        }
      }

      // Cierres afectados: el de la fecha anterior y el de la nueva (pueden coincidir)
      const cierreAntes = await cierreQueContieneTimestamp(tx, cocheActual.sucursalId, cocheActual.fecha);
      const cierreNueva = await cierreQueContieneTimestamp(tx, parsed.data.sucursalId, nuevaFecha);

      const afectados = new Set<string>();
      if (cierreAntes) afectados.add(cierreAntes.id);
      if (cierreNueva) afectados.add(cierreNueva.id);
      cierresAfectadosIds = [...afectados];

      // Construir cambios para auditoría
      const cambios: Array<{ campo: string; valorAnterior: string; valorNuevo: string }> = [];
      if (cocheActual.sucursalId !== parsed.data.sucursalId) {
        cambios.push({ campo: "sucursalId", valorAnterior: cocheActual.sucursalId, valorNuevo: parsed.data.sucursalId });
      }
      const fechaAnteriorStr = cocheActual.fecha.toISOString();
      const fechaNuevaStr = nuevaFecha.toISOString();
      if (fechaAnteriorStr !== fechaNuevaStr) {
        cambios.push({ campo: "fecha", valorAnterior: fechaAnteriorStr, valorNuevo: fechaNuevaStr });
      }
      if ((cocheActual.notas ?? null) !== (parsed.data.notas ?? null)) {
        cambios.push({ campo: "notas", valorAnterior: cocheActual.notas ?? "(vacío)", valorNuevo: parsed.data.notas ?? "(vacío)" });
      }
      // Resumen de detalles
      const detallesAnterior = cocheActual.detalles
        .map((d) => {
          const base = d.cantidadUnidades != null ? `${d.cantidadUnidades}u` : `${d.numLatas ?? 0}×${d.panesPorLata ?? 0}`;
          return `${base} p${d.productoId.slice(-4)}`;
        })
        .join(", ");
      const detallesNuevo = parsed.data.detalles
        .map((d) => {
          const base = d.modo === "UNIDADES" ? `${d.cantidadUnidades}u` : `${d.numLatas}×${d.panesPorLata}`;
          return `${base} p${d.productoId.slice(-4)}`;
        })
        .join(", ");
      if (detallesAnterior !== detallesNuevo) {
        cambios.push({ campo: "detalles", valorAnterior: detallesAnterior, valorNuevo: detallesNuevo });
      }

      // Actualizar coche: reemplazar detalles y actualizar cabecera
      await tx.detalleCoche.deleteMany({ where: { cocheId } });
      await tx.cocheProduccion.update({
        where: { id: cocheId },
        data: {
          sucursalId: parsed.data.sucursalId,
          fecha: nuevaFecha,
          notas: parsed.data.notas,
          detalles: {
            create: parsed.data.detalles.map((d) =>
              d.modo === "LATAS"
                ? {
                    productoId: d.productoId,
                    numLatas: d.numLatas,
                    panesPorLata: d.panesPorLata,
                    cantidadUnidades: null,
                    mermas: d.mermas,
                  }
                : {
                    productoId: d.productoId,
                    numLatas: null,
                    panesPorLata: null,
                    cantidadUnidades: d.cantidadUnidades,
                    mermas: d.mermas,
                  }
            ),
          },
        },
      });

      // Recalcular cierres afectados
      for (const cierreId of afectados) {
        await recalcularCierre(tx, cierreId);
      }

      if (cambios.length > 0) {
        await registrarAuditoria(tx, {
          entidad: "CocheProduccion",
          entidadId: cocheId,
          accion: "EDITAR",
          cambios,
          userId,
        });
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("PERMISO:")) return { ok: false, mensaje: msg.replace("PERMISO: ", "") };
    return { ok: false, mensaje: "No se pudo guardar la edición del coche." };
  }

  revalidatePath("/produccion");
  revalidatePath("/caja");
  revalidatePath("/dashboard");

  const aviso = cierresAfectadosIds.length > 0 ? "&recalculado=1" : "";
  redirect(`/produccion?editado=1${aviso}`);
}
