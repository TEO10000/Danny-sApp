import { prisma } from "@/lib/prisma";

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
