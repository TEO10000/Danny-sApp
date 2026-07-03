"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";

export type EstadoAccion =
  | { ok: boolean; mensaje: string; passwordTemporal?: string }
  | null;

async function exigirAdmin() {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    throw new Error("Solo el administrador puede gestionar usuarios.");
  }
  return session.user;
}

const rolSchema = z.enum(["ADMIN", "PANADERO", "ATENCION_CLIENTE"]);

const crearSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("El email no es válido."),
  rol: rolSchema,
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

const editarSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("El email no es válido."),
  rol: rolSchema,
});

export async function crearUsuario(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const admin = await exigirAdmin();

  const parsed = crearSchema.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    rol: formData.get("rol"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  const { nombre, email, rol, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const usuario = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { nombre, email, rol, passwordHash },
      });
      await registrarAuditoria(tx, {
        entidad: "User",
        entidadId: u.id,
        accion: "CREAR",
        userId: admin.id!,
      });
      return u;
    });

    revalidatePath("/usuarios");
    return { ok: true, mensaje: `Usuario "${usuario.nombre}" creado correctamente.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { ok: false, mensaje: "Ese email ya está registrado." };
    }
    return { ok: false, mensaje: "No se pudo crear el usuario. Intenta de nuevo." };
  }
}

export async function editarUsuario(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const admin = await exigirAdmin();

  const parsed = editarSchema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    rol: formData.get("rol"),
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }

  const { id, nombre, email, rol } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const actual = await tx.user.findUniqueOrThrow({ where: { id } });
      const cambios: { campo: string; valorAnterior: string; valorNuevo: string }[] = [];

      if (actual.nombre !== nombre) {
        cambios.push({ campo: "nombre", valorAnterior: actual.nombre, valorNuevo: nombre });
      }
      if (actual.email !== email) {
        cambios.push({ campo: "email", valorAnterior: actual.email, valorNuevo: email });
      }
      if (actual.rol !== rol) {
        cambios.push({ campo: "rol", valorAnterior: actual.rol, valorNuevo: rol });
      }

      if (cambios.length === 0) return;

      await tx.user.update({ where: { id }, data: { nombre, email, rol } });
      await registrarAuditoria(tx, {
        entidad: "User",
        entidadId: id,
        accion: "EDITAR",
        cambios,
        userId: admin.id!,
      });
    });

    revalidatePath("/usuarios");
    return { ok: true, mensaje: "Usuario actualizado correctamente." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { ok: false, mensaje: "Ese email ya está registrado." };
    }
    return { ok: false, mensaje: "No se pudo actualizar el usuario." };
  }
}

const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generarPasswordTemporal(longitud = 12): string {
  const bytes = randomBytes(longitud);
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("");
}

export async function resetearPassword(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const admin = await exigirAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "ID de usuario inválido." };

  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await bcrypt.hash(passwordTemporal, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await registrarAuditoria(tx, {
      entidad: "User",
      entidadId: id,
      accion: "RESET_PASSWORD",
      userId: admin.id!,
    });
  });

  revalidatePath("/usuarios");
  return {
    ok: true,
    mensaje: "Contraseña restablecida. Cópiala ahora; no se volverá a mostrar.",
    passwordTemporal,
  };
}

export async function cambiarEstadoUsuario(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const admin = await exigirAdmin();
  const id = String(formData.get("id") ?? "");
  const activarStr = String(formData.get("activar") ?? "");
  if (!id) return { ok: false, mensaje: "ID de usuario inválido." };

  const activar = activarStr === "true";

  if (!activar && id === admin.id) {
    return { ok: false, mensaje: "No puedes desactivarte a ti mismo." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (!activar) {
        const adminsActivos = await tx.user.count({
          where: { rol: "ADMIN", activo: true },
        });
        if (adminsActivos <= 1) {
          throw new Error("NO_ULTIMO_ADMIN");
        }
      }

      await tx.user.update({ where: { id }, data: { activo: activar } });
      await registrarAuditoria(tx, {
        entidad: "User",
        entidadId: id,
        accion: activar ? "ACTIVAR" : "DESACTIVAR",
        userId: admin.id!,
      });
    });

    revalidatePath("/usuarios");
    return {
      ok: true,
      mensaje: activar ? "Usuario reactivado." : "Usuario desactivado.",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NO_ULTIMO_ADMIN") {
      return {
        ok: false,
        mensaje: "No puedes desactivar al último administrador activo.",
      };
    }
    return { ok: false, mensaje: "No se pudo cambiar el estado del usuario." };
  }
}
