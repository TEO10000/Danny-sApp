import { Prisma, TipoTurno as PrismaTipoTurno } from "@prisma/client";
import { preciosVigentesEn } from "@/lib/catalogo";
import { datosParaCierre, finDeTurno, strDeFechaDia, type TipoTurno } from "@/lib/turnos";

const FONDO_CAJA = 40;

/**
 * Recalcula VentaCalculada, efectivoEsperado y descuadre de un cierre ya existente.
 * Debe ejecutarse dentro de la misma transacción que realizó el cambio que motiva el recálculo.
 * Usa los precios vigentes en la fecha del turno (no los precios de hoy).
 */
export async function recalcularCierre(
  tx: Prisma.TransactionClient,
  cierreId: string
): Promise<void> {
  // 1. Cargar el cierre con sus sobrantes y facturas de caja
  const cierre = await tx.cierreTurno.findUniqueOrThrow({
    where: { id: cierreId },
    include: {
      sobrantes: { select: { productoId: true, cantidadSobrante: true } },
      facturas: {
        where: { origenPago: "CAJA_TURNO" },
        select: { montoTotal: true },
      },
    },
  });

  const fechaStr = strDeFechaDia(cierre.fecha);
  const tipo = cierre.tipoTurno as TipoTurno;
  const finVentana = finDeTurno(fechaStr, tipo);

  // 2. Precios históricos: los vigentes al momento en que terminó el turno
  const precios = await preciosVigentesEn(finVentana);

  // 3. Rearmar ventana y producido con la misma lógica de datosParaCierre
  const datos = await datosParaCierre(cierre.sucursalId, fechaStr, tipo, {
    tx,
    preciosPorProducto: precios,
  });

  // 4. Sobrantes almacenados en DB (ya actualizados en la misma tx)
  const sobrantePor = new Map(
    cierre.sobrantes.map((s) => [s.productoId, s.cantidadSobrante])
  );

  // 5. Recalcular ventas
  const ventas: Array<{
    sucursalId: string;
    fecha: Date;
    tipoTurno: PrismaTipoTurno;
    productoId: string;
    cantidad: number;
    valor: number;
  }> = [];
  let totalVentas = 0;

  for (const fila of datos.filas) {
    const sobrante = sobrantePor.get(fila.productoId) ?? 0;
    const vendidos = fila.disponible - sobrante;
    const valor = Math.round(vendidos * fila.precio * 100) / 100;
    totalVentas += valor;
    if (vendidos !== 0) {
      ventas.push({
        sucursalId: cierre.sucursalId,
        fecha: cierre.fecha,
        tipoTurno: tipo,
        productoId: fila.productoId,
        cantidad: vendidos,
        valor,
      });
    }
  }
  totalVentas = Math.round(totalVentas * 100) / 100;

  // 6. Borrar y regenerar VentaCalculada de este turno
  await tx.ventaCalculada.deleteMany({
    where: {
      sucursalId: cierre.sucursalId,
      fecha: cierre.fecha,
      tipoTurno: tipo,
    },
  });
  if (ventas.length > 0) {
    await tx.ventaCalculada.createMany({ data: ventas });
  }

  // 7. Recalcular efectivoEsperado y descuadre
  const pagosDesdeCaja = Math.round(
    cierre.facturas.reduce((s, f) => s + Number(f.montoTotal), 0) * 100
  ) / 100;
  const efectivoEsperado = Math.round((FONDO_CAJA + totalVentas - pagosDesdeCaja) * 100) / 100;
  const descuadre = Math.round((Number(cierre.efectivoContado) - efectivoEsperado) * 100) / 100;

  await tx.cierreTurno.update({
    where: { id: cierreId },
    data: { efectivoEsperado, descuadre },
  });
}

/**
 * Encuentra el cierre de la misma sucursal con la ventana inmediatamente
 * posterior a `finVentanaDe`. Retorna null si no existe.
 */
export async function cierreSiguiente(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  finVentanaDe: Date
): Promise<{ id: string; fecha: Date; tipoTurno: string } | null> {
  const cierres = await tx.cierreTurno.findMany({
    where: { sucursalId },
    select: { id: true, fecha: true, tipoTurno: true },
  });

  let mejorFin = Infinity;
  let siguiente: { id: string; fecha: Date; tipoTurno: string } | null = null;

  for (const c of cierres) {
    const finC = finDeTurno(strDeFechaDia(c.fecha), c.tipoTurno as TipoTurno).getTime();
    if (finC > finVentanaDe.getTime() && finC < mejorFin) {
      mejorFin = finC;
      siguiente = { id: c.id, fecha: c.fecha, tipoTurno: c.tipoTurno };
    }
  }

  return siguiente;
}

/**
 * Dado el timestamp de un coche, encuentra el cierre (si existe) cuya ventana
 * lo contiene: el cierre con finDeTurno más pequeño que sea >= fechaCoche.
 */
export async function cierreQueContieneTimestamp(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  fechaCoche: Date
): Promise<{ id: string } | null> {
  const cierres = await tx.cierreTurno.findMany({
    where: { sucursalId },
    select: { id: true, fecha: true, tipoTurno: true },
  });

  let mejorFin = Infinity;
  let encontradoId: string | null = null;

  for (const c of cierres) {
    const finC = finDeTurno(strDeFechaDia(c.fecha), c.tipoTurno as TipoTurno).getTime();
    if (finC >= fechaCoche.getTime() && finC < mejorFin) {
      mejorFin = finC;
      encontradoId = c.id;
    }
  }

  return encontradoId ? { id: encontradoId } : null;
}
