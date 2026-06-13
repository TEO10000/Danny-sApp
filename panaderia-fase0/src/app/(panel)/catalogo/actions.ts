"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function exigirAdmin() {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    throw new Error("Solo el administrador puede modificar el catálogo.");
  }
  return session.user;
}

const productoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto."),
  categoria: z.enum(["PAN_SAL", "PAN_DULCE", "PASTELERIA", "GALLETERIA", "EMPAQUETADO"]),
  precio: z.coerce.number().positive("El precio debe ser mayor a 0."),
  codigoBarras: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type EstadoAccion = { ok: boolean; mensaje: string } | null;

export async function crearProducto(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  await exigirAdmin();

  const parsed = productoSchema.safeParse({
    nombre: formData.get("nombre"),
    categoria: formData.get("categoria"),
    precio: formData.get("precio"),
    codigoBarras: formData.get("codigoBarras") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  try {
    await prisma.producto.create({
      data: {
        nombre: parsed.data.nombre,
        categoria: parsed.data.categoria,
        codigoBarras: parsed.data.codigoBarras,
        precios: { create: { precio: parsed.data.precio } },
      },
    });
  } catch {
    return { ok: false, mensaje: "No se pudo guardar. ¿El código de barras ya existe?" };
  }

  revalidatePath("/catalogo");
  revalidatePath("/precios");
  return { ok: true, mensaje: `"${parsed.data.nombre}" agregado al catálogo.` };
}

const precioSchema = z.object({
  productoId: z.string().min(1),
  precio: z.coerce.number().positive("El precio debe ser mayor a 0."),
});

export async function actualizarPrecio(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  await exigirAdmin();

  const parsed = precioSchema.safeParse({
    productoId: formData.get("productoId"),
    precio: formData.get("precio"),
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  // Historial de precios (RF-02.2): nunca se edita el precio anterior,
  // se agrega uno nuevo con vigencia desde ahora.
  await prisma.precioProducto.create({
    data: { productoId: parsed.data.productoId, precio: parsed.data.precio },
  });

  revalidatePath("/catalogo");
  revalidatePath("/precios");
  return { ok: true, mensaje: "Precio actualizado." };
}

export async function cambiarActivo(formData: FormData): Promise<void> {
  await exigirAdmin();
  const id = String(formData.get("productoId") ?? "");
  const activo = String(formData.get("activo")) === "true";
  if (!id) return;

  await prisma.producto.update({ where: { id }, data: { activo } });
  revalidatePath("/catalogo");
  revalidatePath("/precios");
}
