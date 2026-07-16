"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { datosParaCierre, fechaDia, finDeTurno, strDeFechaDia, type TipoTurno } from "@/lib/turnos";
import { ventanaTurno } from "@/lib/cierres";
import { recalcularCierre, cierreSiguiente } from "@/lib/recalculo";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizarDecimal } from "@/lib/decimales";
import { preciosVigentesEn } from "@/lib/catalogo";

const zEfectivo = z.preprocess(
  (v) => normalizarDecimal(typeof v === "string" || typeof v === "number" ? v : String(v ?? "")) ?? 0,
  z.number().min(0, "El efectivo contado no puede ser negativo.")
);

const FONDO_CAJA = 40; // RF-10.1: cada turno abre y cierra con $40

const transferenciasSchema = z.object({
  sugeridasConfirmadasIds: z.array(z.string()).default([]),
  manuales: z
    .array(
      z.object({
        monto: z.number().positive().max(10000, "Monto de transferencia fuera de rango."),
        referencia: z.string().trim().optional(),
      })
    )
    .default([]),
});

const cierreSchema = z.object({
  sucursalId: z.string().min(1, "Elige la sucursal."),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  tipoTurno: z.enum(["T1_06_14", "T2_14_22"]),
  efectivoContado: zEfectivo,
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
  facturaIds: z.array(z.string()).default([]),
});

export type EstadoCierre = { ok: boolean; mensaje: string } | null;

export async function obtenerDetalleCierre(cierreId: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "ATENCION_CLIENTE"].includes(session.user.rol ?? "")) {
    throw new Error("No autorizado.");
  }

  const cierre = await prisma.cierreTurno.findUniqueOrThrow({
    where: { id: cierreId },
    include: {
      sucursal: { select: { nombre: true } },
      empleada: { select: { nombre: true } },
      sobrantes: { include: { producto: { select: { nombre: true } } } },
      facturas: {
        select: {
          montoTotal: true,
          estado: true,
          origenPago: true,
          proveedor: { select: { nombre: true } },
        },
      },
      transferencias: {
        where: { estado: "CONFIRMADA" },
        select: {
          monto: true,
          referencia: true,
          remitente: true,
          hora: true,
          estado: true,
        },
      },
    },
  });

  const fechaStr = strDeFechaDia(cierre.fecha);
  const tipo = cierre.tipoTurno as TipoTurno;
  const finVentana = finDeTurno(fechaStr, tipo);
  const precios = await preciosVigentesEn(finVentana);
  const datos = await datosParaCierre(cierre.sucursalId, fechaStr, tipo, { preciosPorProducto: precios });

  const sobrantePor = new Map(cierre.sobrantes.map((s) => [s.productoId, s.cantidadSobrante]));
  const filas = datos.filas.map((fila) => {
    const sobrante = sobrantePor.get(fila.productoId) ?? 0;
    const vendidos = fila.disponible - sobrante;
    return {
      productoId: fila.productoId,
      nombre: fila.nombre,
      anterior: fila.anterior,
      producido: fila.producido,
      disponible: fila.disponible,
      sobrante,
      vendidos,
      precio: fila.precio,
      valor: Math.round(vendidos * fila.precio * 100) / 100,
    };
  });

  return {
    id: cierre.id,
    fecha: cierre.fecha.toISOString(),
    tipoTurno: cierre.tipoTurno,
    sucursal: { nombre: cierre.sucursal.nombre },
    empleada: { nombre: cierre.empleada.nombre },
    fondoInicial: Number(cierre.fondoInicial),
    efectivoEsperado: Number(cierre.efectivoEsperado),
    efectivoContado: Number(cierre.efectivoContado),
    descuadre: Number(cierre.descuadre),
    totalTransferencias: Number(cierre.totalTransferencias),
    notas: cierre.notas,
    filas,
    facturas: cierre.facturas.map((factura) => ({
      proveedor: { nombre: factura.proveedor.nombre },
      monto: Number(factura.montoTotal),
      estado: factura.estado,
      origenPago: factura.origenPago,
    })),
    transferencias: cierre.transferencias.map((transferencia) => ({
      monto: Number(transferencia.monto),
      referencia: transferencia.referencia,
      remitente: transferencia.remitente,
      hora: transferencia.hora ? transferencia.hora.toISOString() : null,
      estado: transferencia.estado,
    })),
    sobrantes: cierre.sobrantes.map((s) => ({
      producto: { nombre: s.producto.nombre },
      cantidadSobrante: s.cantidadSobrante,
    })),
    esAdmin: session.user.rol === "ADMIN",
  };
}

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

  let facturaIdsCrudos: unknown;
  try {
    facturaIdsCrudos = JSON.parse(String(formData.get("facturaIds") ?? "[]"));
  } catch {
    return { ok: false, mensaje: "Los IDs de facturas llegaron corruptos. Recarga e intenta de nuevo." };
  }

  let transferenciasData: z.infer<typeof transferenciasSchema>;
  try {
    const raw = JSON.parse(String(formData.get("transferencias") ?? "{}"));
    const parsedTrans = transferenciasSchema.safeParse(raw);
    if (!parsedTrans.success) {
      transferenciasData = { sugeridasConfirmadasIds: [], manuales: [] };
    } else {
      transferenciasData = parsedTrans.data;
    }
  } catch {
    transferenciasData = { sugeridasConfirmadasIds: [], manuales: [] };
  }

  const parsed = cierreSchema.safeParse({
    sucursalId: formData.get("sucursalId"),
    fecha: formData.get("fecha"),
    tipoTurno: formData.get("tipoTurno"),
    efectivoContado: formData.get("efectivoContado"),
    notas: formData.get("notas") ?? "",
    sobrantes: sobrantesCrudos,
    facturaIds: facturaIdsCrudos,
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

  // Re-verificar facturas desde la DB (nunca confiar en montos del cliente)
  const facturasPendientes =
    d.facturaIds.length > 0
      ? await prisma.facturaProveedor.findMany({
          where: {
            id: { in: d.facturaIds },
            sucursalId: d.sucursalId,
            estado: "PENDIENTE",
          },
          select: { id: true, montoTotal: true },
        })
      : [];

  const pagosDesdeCaja = Math.round(
    (facturasPendientes as Array<{ id: string; montoTotal: unknown }>).reduce(
      (s, f) => s + Number(f.montoTotal),
      0
    ) * 100
  ) / 100;

  // Franja exacta del turno (nunca confiar en ventanas del cliente)
  const franja = ventanaTurno(d.fecha, d.tipoTurno as TipoTurno);

  // Re-verificar transferencias sugeridas desde la DB (montos siempre desde BD)
  // Acepta cualquier sugerida elegible hasta el fin de la franja (incluye "anteriores")
  const sugeridasVerificadas =
    transferenciasData.sugeridasConfirmadasIds.length > 0
      ? await prisma.transferenciaTurno.findMany({
          where: {
            id: { in: transferenciasData.sugeridasConfirmadasIds },
            sucursalId: d.sucursalId,
            estado: "SUGERIDA",
            cierreTurnoId: null,
            OR: [{ hora: { lte: franja.hasta } }, { hora: null }],
          },
          select: { id: true, monto: true },
        })
      : [];

  const totalSugeridasConf = Math.round(
    (sugeridasVerificadas as Array<{ id: string; monto: unknown }>).reduce(
      (s, t) => s + Number(t.monto),
      0
    ) * 100
  ) / 100;

  const totalManuales = Math.round(
    transferenciasData.manuales.reduce((s, m) => s + m.monto, 0) * 100
  ) / 100;

  const totalTransferencias = Math.round((totalSugeridasConf + totalManuales) * 100) / 100;

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
    const vendidos = fila.disponible - sobrante;
    const valor = Math.round(vendidos * fila.precio * 100) / 100;
    totalVentas += valor;
    sobrantesGuardar.push({ productoId: fila.productoId, cantidadSobrante: sobrante });
    if (vendidos !== 0) {
      ventas.push({ productoId: fila.productoId, cantidad: vendidos, valor });
    }
  }
  totalVentas = Math.round(totalVentas * 100) / 100;

  // RF-10.2 — efectivo esperado = fondo + ventas − facturas − transferencias confirmadas
  const efectivoEsperado =
    Math.round((FONDO_CAJA + totalVentas - pagosDesdeCaja - totalTransferencias) * 100) / 100;
  const descuadre = Math.round((d.efectivoContado - efectivoEsperado) * 100) / 100;

  const fecha = fechaDia(d.fecha);
  const empleadaId = session.user!.id!;
  const facturaIdsVerificados = (
    facturasPendientes as Array<{ id: string; montoTotal: unknown }>
  ).map((f) => f.id);

  const sugeridasVerificadasIds = (
    sugeridasVerificadas as Array<{ id: string; monto: unknown }>
  ).map((t) => t.id);

  // Solo descartar SUGERIDAS de este turno no confirmadas
  // Las "anteriores" (hora < franja.desde) se conservan SUGERIDA para cierres futuros
  const sugeridasDeLaFranja = await prisma.transferenciaTurno.findMany({
    where: {
      sucursalId: d.sucursalId,
      estado: "SUGERIDA",
      cierreTurnoId: null,
      hora: { gt: franja.desde, lte: franja.hasta },
    },
    select: { id: true },
  });
  const descartadasIds = sugeridasDeLaFranja
    .map((t) => t.id)
    .filter((id) => !sugeridasVerificadasIds.includes(id));

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cierre = await tx.cierreTurno.create({
        data: {
          sucursalId: d.sucursalId,
          fecha,
          tipoTurno: d.tipoTurno,
          empleadaId,
          fondoInicial: FONDO_CAJA,
          efectivoContado: d.efectivoContado,
          efectivoEsperado,
          descuadre,
          totalTransferencias,
          notas: d.notas,
          sobrantes: { create: sobrantesGuardar },
        },
      });

      if (ventas.length > 0) {
        await tx.ventaCalculada.createMany({
          data: ventas.map((v) => ({
            sucursalId: d.sucursalId,
            fecha,
            tipoTurno: d.tipoTurno,
            productoId: v.productoId,
            cantidad: v.cantidad,
            valor: v.valor,
          })),
        });
      }

      if (facturaIdsVerificados.length > 0) {
        await tx.facturaProveedor.updateMany({
          where: { id: { in: facturaIdsVerificados } },
          data: {
            estado: "PAGADA",
            origenPago: "CAJA_TURNO",
            pagadaPorId: empleadaId,
            fechaPago: new Date(),
            cierreTurnoId: cierre.id,
          },
        });
      }

      // Confirmar sugeridas verificadas
      if (sugeridasVerificadasIds.length > 0) {
        await tx.transferenciaTurno.updateMany({
          where: { id: { in: sugeridasVerificadasIds } },
          data: { estado: "CONFIRMADA", cierreTurnoId: cierre.id },
        });
      }

      // Descartar sugeridas no confirmadas de la ventana
      if (descartadasIds.length > 0) {
        await tx.transferenciaTurno.updateMany({
          where: { id: { in: descartadasIds } },
          data: { estado: "DESCARTADA", cierreTurnoId: cierre.id },
        });
      }

      // Crear transferencias manuales
      for (const m of transferenciasData.manuales) {
        await tx.transferenciaTurno.create({
          data: {
            sucursalId: d.sucursalId,
            cierreTurnoId: cierre.id,
            monto: m.monto,
            referencia: m.referencia ?? null,
            estado: "CONFIRMADA",
            origen: "MANUAL",
          },
        });
      }
    });
  } catch {
    return {
      ok: false,
      mensaje:
        "No se pudo guardar el cierre. Puede que alguien lo haya cerrado al mismo tiempo: recarga y verifica.",
    };
  }

  revalidatePath("/caja");
  revalidatePath("/facturas");
  revalidatePath("/dashboard");
  redirect("/caja?guardado=1");
}

// ── Schemas compartidos para edición ─────────────────────────────────────────

const editarCierreSchema = z.object({
  id: z.string().min(1),
  efectivoContado: zEfectivo,
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

export async function editarCierre(
  _prev: EstadoCierre,
  formData: FormData
): Promise<EstadoCierre> {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    return { ok: false, mensaje: "Solo el administrador puede editar cierres." };
  }
  const adminId = session.user.id!;

  let sobrantesCrudos: unknown;
  try {
    sobrantesCrudos = JSON.parse(String(formData.get("sobrantes") ?? "[]"));
  } catch {
    return { ok: false, mensaje: "Los sobrantes llegaron incompletos." };
  }

  const parsed = editarCierreSchema.safeParse({
    id: formData.get("id"),
    efectivoContado: formData.get("efectivoContado"),
    notas: formData.get("notas") ?? "",
    sobrantes: sobrantesCrudos,
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const actual = await tx.cierreTurno.findUniqueOrThrow({
        where: { id: d.id },
        include: { sobrantes: true },
      });

      const cambios: Array<{ campo: string; valorAnterior: string; valorNuevo: string }> = [];

      // Comparar efectivo
      if (Number(actual.efectivoContado) !== d.efectivoContado) {
        cambios.push({
          campo: "efectivoContado",
          valorAnterior: String(Number(actual.efectivoContado)),
          valorNuevo: String(d.efectivoContado),
        });
      }

      // Comparar notas
      const notasAnterior = actual.notas ?? null;
      if (notasAnterior !== d.notas) {
        cambios.push({
          campo: "notas",
          valorAnterior: notasAnterior ?? "(vacío)",
          valorNuevo: d.notas ?? "(vacío)",
        });
      }

      // Comparar y upsert sobrantes
      const sobranteActualPor = new Map(
        actual.sobrantes.map((s) => [s.productoId, s.cantidadSobrante])
      );
      for (const s of d.sobrantes) {
        const anterior = sobranteActualPor.get(s.productoId) ?? 0;
        if (anterior !== s.cantidad) {
          cambios.push({
            campo: `sobrante:${s.productoId}`,
            valorAnterior: String(anterior),
            valorNuevo: String(s.cantidad),
          });
        }
        await tx.sobranteTurno.upsert({
          where: { cierreTurnoId_productoId: { cierreTurnoId: d.id, productoId: s.productoId } },
          update: { cantidadSobrante: s.cantidad },
          create: { cierreTurnoId: d.id, productoId: s.productoId, cantidadSobrante: s.cantidad },
        });
      }

      // Actualizar cabecera
      await tx.cierreTurno.update({
        where: { id: d.id },
        data: { efectivoContado: d.efectivoContado, notas: d.notas },
      });

      // Recalcular este cierre
      await recalcularCierre(tx, d.id);

      // Recalcular el siguiente si existe (cascada 1 nivel)
      const tipo = actual.tipoTurno as TipoTurno;
      const finActual = finDeTurno(strDeFechaDia(actual.fecha), tipo);
      const sig = await cierreSiguiente(tx, actual.sucursalId, finActual);
      if (sig) {
        await recalcularCierre(tx, sig.id);
      }

      if (cambios.length > 0) {
        await registrarAuditoria(tx, {
          entidad: "CierreTurno",
          entidadId: d.id,
          accion: "EDITAR",
          cambios,
          userId: adminId,
        });
      }
    });
  } catch {
    return { ok: false, mensaje: "No se pudo guardar la edición del cierre." };
  }

  revalidatePath("/caja");
  revalidatePath("/dashboard");
  redirect("/caja?editado=1");
}

export async function eliminarCierre(
  _prev: EstadoCierre,
  formData: FormData
): Promise<EstadoCierre> {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    return { ok: false, mensaje: "Solo el administrador puede eliminar cierres." };
  }
  const adminId = session.user.id!;

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, mensaje: "ID de cierre inválido." };

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cierre = await tx.cierreTurno.findUniqueOrThrow({
        where: { id },
        include: { sobrantes: true, facturas: { where: { origenPago: "CAJA_TURNO" } } },
      });

      const tipo = cierre.tipoTurno as TipoTurno;
      const finActual = finDeTurno(strDeFechaDia(cierre.fecha), tipo);

      // Obtener el siguiente ANTES de borrar
      const sig = await cierreSiguiente(tx, cierre.sucursalId, finActual);

      // Revertir facturas de caja a PENDIENTE
      if (cierre.facturas.length > 0) {
        await tx.facturaProveedor.updateMany({
          where: { id: { in: cierre.facturas.map((f) => f.id) } },
          data: {
            estado: "PENDIENTE",
            origenPago: null,
            pagadaPorId: null,
            fechaPago: null,
            cierreTurnoId: null,
          },
        });
      }

      // Revertir transferencias: CORREO → SUGERIDA, MANUAL → eliminar
      await tx.transferenciaTurno.updateMany({
        where: { cierreTurnoId: id, origen: "CORREO" },
        data: { estado: "SUGERIDA", cierreTurnoId: null },
      });
      await tx.transferenciaTurno.deleteMany({
        where: { cierreTurnoId: id, origen: "MANUAL" },
      });

      // Borrar ventas calculadas
      await tx.ventaCalculada.deleteMany({
        where: { sucursalId: cierre.sucursalId, fecha: cierre.fecha, tipoTurno: tipo },
      });

      // Snapshot para auditoría
      const snapshot = JSON.stringify({
        fecha: strDeFechaDia(cierre.fecha),
        tipo,
        sucursalId: cierre.sucursalId,
        sobrantes: cierre.sobrantes.length,
        facturas: cierre.facturas.length,
      });

      // Auditar ANTES de borrar (para que el userId exista)
      await tx.auditLog.create({
        data: {
          entidad: "CierreTurno",
          entidadId: id,
          accion: "ELIMINAR",
          valorAnterior: snapshot,
          userId: adminId,
        },
      });

      // Borrar sobrantes y cierre
      await tx.sobranteTurno.deleteMany({ where: { cierreTurnoId: id } });
      await tx.cierreTurno.delete({ where: { id } });

      // Recalcular el siguiente (ahora su "anterior" es el previo-previo)
      if (sig) {
        await recalcularCierre(tx, sig.id);
      }
    });
  } catch {
    return { ok: false, mensaje: "No se pudo eliminar el cierre." };
  }

  revalidatePath("/caja");
  revalidatePath("/facturas");
  revalidatePath("/dashboard");
  redirect("/caja?eliminado=1");
}

// ── Edición de transferencias de un cierre (solo ADMIN) ───────────────────────

const editarTransferenciasSchema = z.object({
  cierreId: z.string().min(1),
  confirmadasIds: z.array(z.string()).default([]),
  manualesNuevas: z
    .array(
      z.object({
        monto: z.number().positive().max(10000),
        referencia: z.string().trim().optional(),
      })
    )
    .default([]),
});

export async function editarTransferencias(
  _prev: EstadoCierre,
  formData: FormData
): Promise<EstadoCierre> {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    return { ok: false, mensaje: "Solo el administrador puede editar transferencias." };
  }
  const adminId = session.user.id!;

  let confirmadasIdsCrudos: unknown;
  let manualesNuevasCrudas: unknown;
  try {
    confirmadasIdsCrudos = JSON.parse(String(formData.get("confirmadasIds") ?? "[]"));
    manualesNuevasCrudas = JSON.parse(String(formData.get("manualesNuevas") ?? "[]"));
  } catch {
    return { ok: false, mensaje: "Datos de transferencias inválidos." };
  }

  const parsed = editarTransferenciasSchema.safeParse({
    cierreId: formData.get("cierreId"),
    confirmadasIds: confirmadasIdsCrudos,
    manualesNuevas: manualesNuevasCrudas,
  });
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.errors[0].message };
  }
  const d = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Cargar todas las transferencias de este cierre (excepto MANUAL ya confirmadas — las dejamos)
      const todas = await tx.transferenciaTurno.findMany({
        where: { cierreTurnoId: d.cierreId, origen: "CORREO" },
        select: { id: true, estado: true, monto: true },
      });

      const cambios: Array<{ campo: string; valorAnterior: string; valorNuevo: string }> = [];

      for (const t of todas) {
        const debeConfirmar = d.confirmadasIds.includes(t.id);
        const estadoNuevo = debeConfirmar ? "CONFIRMADA" : "DESCARTADA";
        if (t.estado !== estadoNuevo) {
          cambios.push({
            campo: `transferencia:${t.id}:estado`,
            valorAnterior: t.estado,
            valorNuevo: estadoNuevo,
          });
          await tx.transferenciaTurno.update({
            where: { id: t.id },
            data: { estado: estadoNuevo },
          });
        }
      }

      // Crear manuales nuevas
      for (const m of d.manualesNuevas) {
        const cierre = await tx.cierreTurno.findUniqueOrThrow({
          where: { id: d.cierreId },
          select: { sucursalId: true },
        });
        const nueva = await tx.transferenciaTurno.create({
          data: {
            sucursalId: cierre.sucursalId,
            cierreTurnoId: d.cierreId,
            monto: m.monto,
            referencia: m.referencia ?? null,
            estado: "CONFIRMADA",
            origen: "MANUAL",
          },
        });
        cambios.push({
          campo: `transferencia:${nueva.id}:nueva`,
          valorAnterior: "(ninguna)",
          valorNuevo: `MANUAL $${m.monto}`,
        });
      }

      await recalcularCierre(tx, d.cierreId);

      const tipo = (
        await tx.cierreTurno.findUniqueOrThrow({
          where: { id: d.cierreId },
          select: { tipoTurno: true, fecha: true, sucursalId: true },
        })
      ) as { tipoTurno: string; fecha: Date; sucursalId: string };
      const finActual = finDeTurno(strDeFechaDia(tipo.fecha), tipo.tipoTurno as TipoTurno);
      const sig = await cierreSiguiente(tx, tipo.sucursalId, finActual);
      if (sig) await recalcularCierre(tx, sig.id);

      if (cambios.length > 0) {
        await registrarAuditoria(tx, {
          entidad: "TransferenciaTurno",
          entidadId: d.cierreId,
          accion: "EDITAR",
          cambios,
          userId: adminId,
        });
      }
    });
  } catch {
    return { ok: false, mensaje: "No se pudieron guardar los cambios de transferencias." };
  }

  revalidatePath("/caja");
  revalidatePath("/dashboard");
  return { ok: true, mensaje: "Transferencias actualizadas y cierre recalculado." };
}
