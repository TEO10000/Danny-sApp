"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function exigirAdmin() {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    throw new Error("Solo el administrador puede realizar esta acción.");
  }
  return session.user;
}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

export async function aprobarPlan(planId: string): Promise<ResultadoAccion> {
  let user: { id: string };
  try {
    user = await exigirAdmin();
  } catch {
    return { ok: false, error: "Sin permisos." };
  }

  try {
    await prisma.planSemanal.update({
      where: { id: planId },
      data: {
        estado: "APROBADO",
        aprobadoPorId: user.id,
      },
    });
    revalidatePath("/plan-semanal");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo aprobar el plan." };
  }
}

export async function generarPlanManual(
  sucursalId: string,
  semanaInicio: string
): Promise<ResultadoAccion> {
  try {
    await exigirAdmin();
  } catch {
    return { ok: false, error: "Sin permisos." };
  }

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${base}/api/cron/plan-semanal?sucursalId=${encodeURIComponent(sucursalId)}&semanaInicio=${encodeURIComponent(semanaInicio)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? "Error al generar el plan." };
    }
    revalidatePath("/plan-semanal");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor de generación." };
  }
}
