"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function exigirAdmin() {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    throw new Error("Solo el administrador puede gestionar campañas.");
  }
  return session.user;
}

const SchemaCampania = z.object({
  nombre: z.string().min(1, "El nombre es requerido."),
  descripcion: z.string().optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  costo: z.coerce.number().min(0, "El costo no puede ser negativo."),
  sucursalId: z.string().nullable(),
  productosIds: z.array(z.string()).min(1, "Selecciona al menos un producto."),
});

export type ResultadoCampania =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export async function crearCampania(formData: FormData): Promise<ResultadoCampania> {
  try {
    await exigirAdmin();
  } catch {
    return { ok: false, error: "Sin permisos." };
  }

  const payload = formData.get("payload");
  if (typeof payload !== "string") return { ok: false, error: "Datos inválidos." };

  let datos: unknown;
  try {
    datos = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Datos inválidos." };
  }

  const parsed = SchemaCampania.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0].message };
  }

  const { nombre, descripcion, fechaInicio, fechaFin, costo, sucursalId, productosIds } =
    parsed.data;

  if (fechaInicio > fechaFin) {
    return { ok: false, error: "La fecha de inicio no puede ser posterior a la fecha de fin." };
  }

  try {
    const campania = await prisma.$transaction(async (tx) => {
      const c = await tx.campania.create({
        data: {
          nombre,
          descripcion: descripcion ?? null,
          fechaInicio: new Date(fechaInicio + "T12:00:00-05:00"),
          fechaFin: new Date(fechaFin + "T12:00:00-05:00"),
          costo,
          sucursalId: sucursalId || null,
        },
      });
      await tx.campaniaProducto.createMany({
        data: productosIds.map((productoId) => ({ campaniaId: c.id, productoId })),
      });
      return c;
    });

    revalidatePath("/campanias");
    return { ok: true, id: campania.id };
  } catch {
    return { ok: false, error: "No se pudo guardar la campaña." };
  }
}

export async function editarCampania(
  id: string,
  formData: FormData
): Promise<ResultadoCampania> {
  try {
    await exigirAdmin();
  } catch {
    return { ok: false, error: "Sin permisos." };
  }

  const payload = formData.get("payload");
  if (typeof payload !== "string") return { ok: false, error: "Datos inválidos." };

  let datos: unknown;
  try {
    datos = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Datos inválidos." };
  }

  const parsed = SchemaCampania.safeParse(datos);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0].message };
  }

  const { nombre, descripcion, fechaInicio, fechaFin, costo, sucursalId, productosIds } =
    parsed.data;

  if (fechaInicio > fechaFin) {
    return { ok: false, error: "La fecha de inicio no puede ser posterior a la fecha de fin." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.campania.update({
        where: { id },
        data: {
          nombre,
          descripcion: descripcion ?? null,
          fechaInicio: new Date(fechaInicio + "T12:00:00-05:00"),
          fechaFin: new Date(fechaFin + "T12:00:00-05:00"),
          costo,
          sucursalId: sucursalId || null,
        },
      });
      await tx.campaniaProducto.deleteMany({ where: { campaniaId: id } });
      await tx.campaniaProducto.createMany({
        data: productosIds.map((productoId) => ({ campaniaId: id, productoId })),
      });
    });

    revalidatePath("/campanias");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar la campaña." };
  }
}

export async function eliminarCampania(id: string): Promise<ResultadoCampania> {
  try {
    await exigirAdmin();
  } catch {
    return { ok: false, error: "Sin permisos." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.campaniaProducto.deleteMany({ where: { campaniaId: id } });
      await tx.campania.delete({ where: { id } });
    });

    revalidatePath("/campanias");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo eliminar la campaña." };
  }
}
