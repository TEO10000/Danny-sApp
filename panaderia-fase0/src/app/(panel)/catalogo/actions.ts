"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { registrarAuditoria } from "@/lib/auditoria";
import { zMonto } from "@/lib/decimales";

async function exigirPermisoCatalogo() {
  const session = await auth();
  const rol = session?.user?.rol;
  if (rol !== "ADMIN" && rol !== "ATENCION_CLIENTE") {
    throw new Error("No tienes permiso para modificar el catálogo.");
  }
  return session!.user;
}

const CATEGORIAS_ENUM = z.enum(["PAN_SAL", "PAN_DULCE", "PASTELERIA", "GALLETERIA", "EMPAQUETADO"]);

const productoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto."),
  categoria: CATEGORIAS_ENUM,
  precio: zMonto,
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
  await exigirPermisoCatalogo();

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
  precio: zMonto,
});

export async function actualizarPrecio(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  await exigirPermisoCatalogo();

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
  await exigirPermisoCatalogo();
  const id = String(formData.get("productoId") ?? "");
  const activo = String(formData.get("activo")) === "true";
  if (!id) return;

  await prisma.producto.update({ where: { id }, data: { activo } });
  revalidatePath("/catalogo");
  revalidatePath("/precios");
}

const editarProductoSchema = z.object({
  productoId: z.string().min(1, "ID de producto inválido."),
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  categoria: CATEGORIAS_ENUM,
});

export async function editarProducto(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const user = await exigirPermisoCatalogo();

  const parsed = editarProductoSchema.safeParse({
    productoId: formData.get("productoId"),
    nombre: formData.get("nombre"),
    categoria: formData.get("categoria"),
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }
  const { productoId, nombre, categoria } = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const actual = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });

      // Verificar duplicado de nombre entre productos activos (excluyendo el actual)
      const duplicado = await tx.producto.findFirst({
        where: { nombre, activo: true, id: { not: productoId } },
        select: { id: true },
      });
      if (duplicado) {
        throw new Error(`Ya existe un producto activo con el nombre "${nombre}".`);
      }

      const cambios: Array<{ campo: string; valorAnterior: string; valorNuevo: string }> = [];
      if (actual.nombre !== nombre) {
        cambios.push({ campo: "nombre", valorAnterior: actual.nombre, valorNuevo: nombre });
      }
      if (actual.categoria !== categoria) {
        cambios.push({ campo: "categoria", valorAnterior: actual.categoria, valorNuevo: categoria });
      }

      if (cambios.length === 0) return; // nada cambió

      await tx.producto.update({ where: { id: productoId }, data: { nombre, categoria } });

      await registrarAuditoria(tx, {
        entidad: "Producto",
        entidadId: productoId,
        accion: "EDITAR",
        cambios,
        userId: user.id!,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo guardar.";
    return { ok: false, mensaje: msg };
  }

  revalidatePath("/catalogo");
  revalidatePath("/precios");
  revalidatePath("/produccion");
  return { ok: true, mensaje: "Producto actualizado correctamente." };
}
