import { prisma } from "@/lib/prisma";
import { preciosVigentesEn } from "@/lib/catalogo";

export type TipoTurno = "T1_06_14" | "T2_14_22";

export const TURNOS: Array<{ valor: TipoTurno; etiqueta: string }> = [
  { valor: "T1_06_14", etiqueta: "Turno 1 · 6:00 – 14:00" },
  { valor: "T2_14_22", etiqueta: "Turno 2 · 14:00 – 22:00" },
];

export function etiquetaTurno(valor: string): string {
  return TURNOS.find((t) => t.valor === valor)?.etiqueta ?? valor;
}

export const FONDO_CAJA = 40;

/** "YYYY-MM-DD" de hoy en hora de Ecuador */
export function hoyEcuador(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
}

/** Turno sugerido según la hora actual de Ecuador */
export function turnoActual(): TipoTurno {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Guayaquil",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  return hora < 14 ? "T1_06_14" : "T2_14_22";
}

/** Fecha normalizada (mediodía Ecuador) para columnas @db.Date sin saltos de día */
export function fechaDia(fechaISO: string): Date {
  return new Date(`${fechaISO}T12:00:00-05:00`);
}

/**
 * Ventana horaria del turno en hora de Ecuador. La producción registrada
 * dentro de la ventana cuenta para ese turno (los coches de hoy guardan la
 * hora real; los retroactivos quedan a mediodía → Turno 1).
 */
export function ventanaTurno(fechaISO: string, turno: TipoTurno): { desde: Date; hasta: Date } {
  if (turno === "T1_06_14") {
    return {
      desde: new Date(`${fechaISO}T00:00:00-05:00`),
      hasta: new Date(`${fechaISO}T14:00:00-05:00`),
    };
  }
  return {
    desde: new Date(`${fechaISO}T14:00:00-05:00`),
    hasta: new Date(`${fechaISO}T23:59:59.999-05:00`),
  };
}

type MapaCantidad = Map<string, number>;

type CierreAnterior = {
  id: string;
  sobrantes: Array<{ productoId: string; cantidadSobrante: number }>;
} | null;

/** Sobrantes del cierre inmediatamente anterior de la sucursal (mismo día T1 si cerramos T2, o el último de días previos). */
export async function sobranteAnterior(
  sucursalId: string,
  fechaISO: string,
  turno: TipoTurno
): Promise<MapaCantidad> {
  const fecha = fechaDia(fechaISO);
  let anterior: CierreAnterior = null;

  if (turno === "T2_14_22") {
    anterior = (await prisma.cierreTurno.findFirst({
      where: { sucursalId, fecha, tipoTurno: "T1_06_14" },
      include: { sobrantes: true },
    })) as CierreAnterior;
  }
  if (!anterior) {
    anterior = (await prisma.cierreTurno.findFirst({
      where: { sucursalId, fecha: { lt: fecha } },
      orderBy: [{ fecha: "desc" }, { tipoTurno: "desc" }],
      include: { sobrantes: true },
    })) as CierreAnterior;
  }

  const mapa: MapaCantidad = new Map();
  for (const s of anterior?.sobrantes ?? []) {
    mapa.set(s.productoId, s.cantidadSobrante);
  }
  return mapa;
}

/** Panes buenos producidos para la sucursal dentro de la ventana del turno. */
export async function produccionDelTurno(
  sucursalId: string,
  fechaISO: string,
  turno: TipoTurno
): Promise<MapaCantidad> {
  const { desde, hasta } = ventanaTurno(fechaISO, turno);
  const detalles = (await prisma.detalleCoche.findMany({
    where: { coche: { sucursalId, fecha: { gte: desde, lt: hasta } } },
  })) as Array<{ productoId: string; numLatas: number; panesPorLata: number; mermas: number }>;

  const mapa: MapaCantidad = new Map();
  for (const d of detalles) {
    const buenos = Math.max(d.numLatas * d.panesPorLata - d.mermas, 0);
    mapa.set(d.productoId, (mapa.get(d.productoId) ?? 0) + buenos);
  }
  return mapa;
}

export type VentaCalculadaLinea = {
  productoId: string;
  disponible: number;
  sobrante: number;
  cantidad: number; // ventas (≥ 0)
  valor: number;
  ajustada: boolean; // true si sobrante > disponible (dato a revisar)
};

/**
 * ventas = (sobrante anterior + producción del turno) − sobrante del cierre.
 * Si da negativo (se contó más de lo disponible), se ajusta a 0 y se marca.
 */
export async function calcularVentas(
  sucursalId: string,
  fechaISO: string,
  turno: TipoTurno,
  sobrantes: Array<{ productoId: string; cantidad: number }>
): Promise<{ lineas: VentaCalculadaLinea[]; totalVentas: number }> {
  const [previo, producido, precios] = await Promise.all([
    sobranteAnterior(sucursalId, fechaISO, turno),
    produccionDelTurno(sucursalId, fechaISO, turno),
    preciosVigentesEn(fechaDia(fechaISO)),
  ]);

  const sobranteMap: MapaCantidad = new Map(sobrantes.map((s) => [s.productoId, s.cantidad]));

  // Unión de productos: lo que había, lo que se horneó y lo que se contó
  const ids = new Set<string>([...previo.keys(), ...producido.keys(), ...sobranteMap.keys()]);

  const lineas: VentaCalculadaLinea[] = [];
  let totalVentas = 0;
  for (const productoId of ids) {
    const disponible = (previo.get(productoId) ?? 0) + (producido.get(productoId) ?? 0);
    const sobrante = sobranteMap.get(productoId) ?? 0;
    const crudo = disponible - sobrante;
    const cantidad = Math.max(crudo, 0);
    const valor = cantidad * (precios.get(productoId) ?? 0);
    totalVentas += valor;
    lineas.push({ productoId, disponible, sobrante, cantidad, valor, ajustada: crudo < 0 });
  }
  return { lineas, totalVentas };
}
