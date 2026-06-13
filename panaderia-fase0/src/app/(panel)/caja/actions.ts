"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { datosParaCierre, fechaDia, type TipoTurno } from "@/lib/turnos";

const FONDO_CAJA = 40; // RF-10.1: cada turno abre y cierra con $40

const cierreSchema = z.object({
  sucursalId: z.string().min(1, "Elige la sucursal."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  tipoTurno: z.enum(["T1_06_14", "T2_14_22"]),
  efectivoContado: z.coerce
    .number()
    .min(0, "El efectivo contado no puede ser negativo."),
  notas: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  sobrantes: z.array(
    z.object({
      productoId: z.string().min(1),
      cantidad: z.coerce.number().int().min(0, "Los sobrantes no pueden ser negativos."),
    })
  ),
});

export type EstadoCierre = { ok: boolean; mensaje: string } | null;

export async function registrarCierre(
  _prev: EstadoCierre,
  formData: FormData
): Promise<EstadoCierre> {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "ATENCION_CLIENTE")) {
    return { ok: false, mensaje: "No tienes permiso para cerrar turnos." };
  }

  let sobrantesCrudos: unknown;
  try {
    sobrantesCrudos = JSON.parse(String(formData.get("sobrantes") ?? "[]"));
  } catch {
    return { ok: false, mensaje: "Los sobrantes llegaron incompletos. Intenta de nuevo." };
  }

  const parsed = cierreSchema.safeParse({
    sucursalId: formData.get("sucursalId"),
    fecha: formData.get("fecha"),
    tipoTurno: formData.get("tipoTurno"),
    efectivoContado: formData.get("efectivoContado"),
    notas: formData.get("notas") ?? "",
    sobrantes: sobrantesCrudos,
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }
  const d = parsed.data;

  // Recalcular en el servidor con los mismos datos que vio la pantalla
  const datos = await datosParaCierre(d.sucursalId, d.fecha, d.tipoTurno as TipoTurno);
  if (datos.yaCerrado) {
    return {
      ok: false,
      mensaje: "Ese turno ya fue cerrado. Si hay un error, avisa al administrador.",
    };
  }

  const sobrantePor = new Map(d.sobrantes.map((s) => [s.productoId, s.cantidad]));

  let totalVentas = 0;
  const ventas: Array<{
    productoId: string;
    cantidad: number;
    valor: number;
  }> = [];
  const sobrantesGuardar: Array<{ productoId: string; cantidadSobrante: number }> = [];

  for (const fila of datos.filas) {
    const sobrante = sobrantePor.get(fila.productoId) ?? 0;
    // Puede salir negativo si faltó registrar producción: se guarda igual,
    // el descuadre y el reporte lo harán visible en vez de esconderlo.
    const vendidos = fila.disponible - sobrante;
    const valor = Math.round(vendidos * fila.precio * 100) / 100;
    totalVentas += valor;
    sobrantesGuardar.push({ productoId: fila.productoId, cantidadSobrante: sobrante });
    if (vendidos !== 0) {
      ventas.push({ productoId: fila.productoId, cantidad: vendidos, valor });
    }
  }
  totalVentas = Math.round(totalVentas * 100) / 100;

  // RF-10.2 — pagos a proveedores desde caja: $0 hasta la Fase 3 (facturas)
  const pagosDesdeCaja = 0;
  const efectivoEsperado =
    Math.round((FONDO_CAJA + totalVentas - pagosDesdeCaja) * 100) / 100;
  const descuadre = Math.round((d.efectivoContado - efectivoEsperado) * 100) / 100;

  const fecha = fechaDia(d.fecha);

  try {
    await prisma.$transaction([
      prisma.cierreTurno.create({
        data: {
          sucursalId: d.sucursalId,
          fecha,
          tipoTurno: d.tipoTurno,
          empleadaId: session.user.id,
          fondoInicial: FONDO_CAJA,
          efectivoContado: d.efectivoContado,
          efectivoEsperado,
          descuadre,
          notas: d.notas,
          sobrantes: { create: sobrantesGuardar },
        },
      }),
      prisma.ventaCalculada.createMany({
        data: ventas.map((v) => ({
          sucursalId: d.sucursalId,
          fecha,
          tipoTurno: d.tipoTurno,
          productoId: v.productoId,
          cantidad: v.cantidad,
          valor: v.valor,
        })),
      }),
    ]);
  } catch {
    return {
      ok: false,
      mensaje:
        "No se pudo guardar el cierre. Puede que alguien lo haya cerrado al mismo tiempo: recarga y verifica.",
    };
  }

  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect("/caja?guardado=1");
}
