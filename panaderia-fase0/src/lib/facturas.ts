import { prisma } from "@/lib/prisma";
import type { TotalesImpresos } from "@/lib/decimales";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LineaV2 = {
  cantidad: number;
  costoUnitario: number;
  descuento: number;
  costoTotal: number;
  tarifaIva: 0 | 15;
};

export type ExtrasV2 = {
  descuentoGlobal: number;
  ice: number;
  irbp: number;
  otros: number;
};

export type ResultadoV2 = {
  base0: number;
  base15: number;
  subtotal: number;
  iva: number;
  montoTotal: number;
  lineasInconsistentes: number[];
  coherencia: (ti: TotalesImpresos) => "verde" | "ambar" | "rojo";
};

export function calcularTotalesFacturaV2(
  lineas: LineaV2[],
  extras: ExtrasV2 = { descuentoGlobal: 0, ice: 0, irbp: 0, otros: 0 }
): ResultadoV2 {
  // 1. Detectar líneas inconsistentes (costoTotal no coincide con qty×cu−desc con tolerancia 0.02)
  const lineasInconsistentes: number[] = [];
  lineas.forEach((l, i) => {
    if (l.cantidad > 0 && l.costoUnitario > 0) {
      const esperado = l.cantidad * l.costoUnitario - l.descuento;
      if (Math.abs(esperado - l.costoTotal) > 0.02) lineasInconsistentes.push(i);
    }
  });

  // 2. Bases por tarifa (costoTotal ya es neto del descuento de línea)
  const base15 = r2(lineas.filter((l) => l.tarifaIva === 15).reduce((s, l) => s + l.costoTotal, 0));
  const base0 = r2(lineas.filter((l) => l.tarifaIva === 0).reduce((s, l) => s + l.costoTotal, 0));

  // 3. Prorratear descuento global entre bases
  const totalBase = base15 + base0;
  let desc15 = 0;
  let desc0 = 0;
  if (extras.descuentoGlobal > 0) {
    if (totalBase > 0) {
      desc15 = r2(extras.descuentoGlobal * (base15 / totalBase));
      desc0 = r2(extras.descuentoGlobal - desc15);
    } else {
      desc0 = extras.descuentoGlobal;
    }
  }
  const base15Neta = r2(base15 - desc15);
  const base0Neta = r2(base0 - desc0);

  // 4. Totales
  const iva = r2(base15Neta * 0.15);
  const subtotal = r2(base0Neta + base15Neta);
  const montoTotal = r2(subtotal + iva + extras.ice + extras.irbp + extras.otros);

  // 5. Semáforo de coherencia con totales impresos
  const coherencia = (ti: TotalesImpresos): "verde" | "ambar" | "rojo" => {
    if (!ti) return "verde";
    const pares: Array<[number, number | null | undefined]> = [
      [base0, ti.base0],
      [base15, ti.base15],
      [extras.descuentoGlobal, ti.descuento],
      [subtotal, ti.subtotal],
      [iva, ti.iva],
      [extras.ice, ti.ice],
      [extras.irbp, ti.irbp],
      [extras.otros, ti.otros],
      [montoTotal, ti.total],
    ];
    let maxDif = 0;
    for (const [calc, imp] of pares) {
      if (imp != null) maxDif = Math.max(maxDif, Math.abs(calc - imp));
    }
    if (maxDif <= 0.01) return "verde";
    if (maxDif <= 0.05) return "ambar";
    return "rojo";
  };

  return { base0, base15, subtotal, iva, montoTotal, lineasInconsistentes, coherencia };
}

export type InsumoConUltimoCosto = {
  id: string;
  nombre: string;
  unidadMedida: string;
  ultimoCostoUnitario: number | null;
};

type InsumoCrudo = {
  id: string;
  nombre: string;
  unidadMedida: string;
  compras: Array<{ costoUnitario: unknown; factura: { fecha: Date } }>;
};

export async function insumosConUltimoCosto(): Promise<InsumoConUltimoCosto[]> {
  const insumos = await prisma.insumo.findMany({
    include: {
      compras: {
        include: { factura: { select: { fecha: true } } },
      },
    },
    orderBy: { nombre: "asc" },
  });
  return (insumos as InsumoCrudo[]).map((i) => {
    const sorted = i.compras
      .slice()
      .sort((a, b) => new Date(b.factura.fecha).getTime() - new Date(a.factura.fecha).getTime());
    return {
      id: i.id,
      nombre: i.nombre,
      unidadMedida: i.unidadMedida,
      ultimoCostoUnitario: sorted[0] ? Number(sorted[0].costoUnitario) : null,
    };
  });
}

export type PuntoEvolucion = {
  fecha: Date;
  costoUnitario: number;
};

type CompraCruda = {
  costoUnitario: unknown;
  factura: { fecha: Date };
};

export async function evolucionCosto(insumoId: string): Promise<PuntoEvolucion[]> {
  const compras = await prisma.compraInsumo.findMany({
    where: { insumoId },
    include: { factura: { select: { fecha: true } } },
  });
  return (compras as CompraCruda[])
    .sort((a, b) => new Date(a.factura.fecha).getTime() - new Date(b.factura.fecha).getTime())
    .map((c) => ({
      fecha: c.factura.fecha,
      costoUnitario: Number(c.costoUnitario),
    }));
}
