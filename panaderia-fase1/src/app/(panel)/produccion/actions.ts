"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const detalleSchema = z.object({
  productoId: z.string().min(1, "Elige el pan de cada fila."),
  numLatas: z.coerce.number().int().min(1, "Cada fila necesita al menos 1 lata."),
  panesPorLata: z.coerce.number().int().min(1, "Indica cuántos panes salen por lata."),
  mermas: z.coerce.number().int().min(0).default(0),
});

const cocheSchema = z.object({
  sucursalId: z.string().min(1, "Elige la sucursal de destino."),
  fecha: z.string().min(1, "Elige la fecha."),
  notas: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  detalles: z.array(detalleSchema).min(1, "Agrega al menos un pan al coche."),
});

export type EstadoCoche = { ok: boolean; mensaje: string } | null;

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
    notas: formData.get("notas") ?? "",
    detalles: detallesCrudos,
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  // Validar mermas: no pueden superar lo producido en su fila
  for (const d of parsed.data.detalles) {
    if (d.mermas > d.numLatas * d.panesPorLata) {
      return { ok: false, mensaje: "Las mermas de una fila superan los panes producidos." };
    }
  }

  // Fecha del coche a mediodía de Ecuador para evitar saltos de día por zona horaria
  const fecha = new Date(`${parsed.data.fecha}T12:00:00-05:00`);
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
        create: parsed.data.detalles.map((d) => ({
          productoId: d.productoId,
          numLatas: d.numLatas,
          panesPorLata: d.panesPorLata,
          mermas: d.mermas,
        })),
      },
    },
  });

  revalidatePath("/produccion");
  redirect("/produccion?guardado=1");
}
