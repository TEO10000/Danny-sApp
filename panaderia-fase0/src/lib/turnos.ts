import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { productosConPrecio } from "@/lib/catalogo";

export type TipoTurno = "T1_06_14" | "T2_14_22";

export const TURNOS: Array<{ valor: TipoTurno; etiqueta: string }> = [
  { valor: "T1_06_14", etiqueta: "Turno 1 · 06:00–14:00" },
  { valor: "T2_14_22", etiqueta: "Turno 2 · 14:00–22:00" },
];

export function etiquetaTurno(valor: string): string {
  return TURNOS.find((t) => t.valor === valor)?.etiqueta ?? valor;
}

/** Momento en que termina un turno, en hora de Ecuador (UTC−5). */
export function finDeTurno(fechaStr: string, tipo: TipoTurno): Date {
  const hora = tipo === "T1_06_14" ? "14:00:00" : "22:00:00";
  return new Date(`${fechaStr}T${hora}-05:00`);
}

/** Fecha "calendario" normalizada para columnas @db.Date (medianoche UTC). */
export function fechaDia(fechaStr: string): Date {
  return new Date(`${fechaStr}T00:00:00.000Z`);
}

export function strDeFechaDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export type FilaCierre = {
  productoId: string;
  nombre: string;
  precio: number;
  anterior: number; // sobrante que dejó el cierre anterior
  producido: number; // panes buenos horneados en la ventana de este turno
  disponible: number; // anterior + producido
};

export type DatosCierre = {
  filas: FilaCierre[];
  inicioVentana: Date | null; // fin del cierre anterior (null si es el primero)
  finVentana: Date;
  cierreAnteriorId: string | null;
  yaCerrado: boolean;
};

type CierrePrevio = {
  id: string;
  fecha: Date;
  tipoTurno: TipoTurno;
  sobrantes: Array<{ productoId: string; cantidadSobrante: number }>;
};

type CocheVentana = {
  detalles: Array<{ productoId: string; numLatas: number; panesPorLata: number; mermas: number }>;
};

/**
 * Arma todo lo necesario para cerrar un turno:
 *  - el sobrante que dejó el cierre anterior de esa sucursal,
 *  - la producción buena registrada entre ese cierre y el fin de este turno,
 *  - el precio vigente de cada producto.
 * La usan tanto la pantalla (vista previa) como la acción de guardar
 * (recalcula en el servidor: nunca se confía en lo que mande el navegador).
 */
export async function datosParaCierre(
  sucursalId: string,
  fechaStr: string,
  tipo: TipoTurno,
  opts?: {
    tx?: Prisma.TransactionClient;
    preciosPorProducto?: Map<string, number>;
  }
): Promise<DatosCierre> {
  const client = opts?.tx ?? (prisma as unknown as Prisma.TransactionClient);
  const finVentana = finDeTurno(fechaStr, tipo);

  const cierresPrevios = (await client.cierreTurno.findMany({
    where: { sucursalId },
    orderBy: { fecha: "desc" },
    take: 60,
    include: { sobrantes: { select: { productoId: true, cantidadSobrante: true } } },
  })) as CierrePrevio[];

  let anterior: CierrePrevio | null = null;
  let yaCerrado = false;
  let mejorFin = -Infinity;
  for (const c of cierresPrevios) {
    const finC = finDeTurno(strDeFechaDia(c.fecha), c.tipoTurno).getTime();
    if (finC === finVentana.getTime()) yaCerrado = true;
    if (finC < finVentana.getTime() && finC > mejorFin) {
      mejorFin = finC;
      anterior = c;
    }
  }
  const inicioVentana = anterior ? new Date(mejorFin) : null;

  const coches = (await client.cocheProduccion.findMany({
    where: {
      sucursalId,
      fecha: { lte: finVentana, ...(inicioVentana ? { gt: inicioVentana } : {}) },
    },
    include: {
      detalles: {
        select: { productoId: true, numLatas: true, panesPorLata: true, mermas: true },
      },
    },
  })) as CocheVentana[];

  const producidoPor = new Map<string, number>();
  for (const c of coches) {
    for (const d of c.detalles) {
      const buenos = Math.max(d.numLatas * d.panesPorLata - d.mermas, 0);
      producidoPor.set(d.productoId, (producidoPor.get(d.productoId) ?? 0) + buenos);
    }
  }

  const anteriorPor = new Map<string, number>();
  for (const s of anterior?.sobrantes ?? []) {
    anteriorPor.set(s.productoId, s.cantidadSobrante);
  }

  // En el cierre se cuenta pan, pastelería y galletería (RF-05.3).
  // Lo EMPAQUETADO se controlará con el lector de código de barras (futuro).
  const productos = (await productosConPrecio(true)).filter(
    (p) => p.categoria !== "EMPAQUETADO"
  );

  const filas: FilaCierre[] = productos.map((p) => {
    const ant = anteriorPor.get(p.id) ?? 0;
    const prod = producidoPor.get(p.id) ?? 0;
    const precio = opts?.preciosPorProducto?.get(p.id) ?? p.precioVigente ?? 0;
    return {
      productoId: p.id,
      nombre: p.nombre,
      precio,
      anterior: ant,
      producido: prod,
      disponible: ant + prod,
    };
  });

  return {
    filas,
    inicioVentana,
    finVentana,
    cierreAnteriorId: anterior?.id ?? null,
    yaCerrado,
  };
}
