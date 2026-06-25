import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dinero } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

type CompraCruda = {
  costoUnitario: unknown;
  cantidad: unknown;
  factura: { fecha: Date };
  insumo: { id: string; nombre: string; unidadMedida: string };
};

export default async function CostosPage() {
  const compras = await prisma.compraInsumo.findMany({
    include: {
      factura: { select: { fecha: true } },
      insumo: { select: { id: true, nombre: true, unidadMedida: true } },
    },
  });

  // Agrupar por insumo y ordenar por fecha
  const porInsumo = new Map<
    string,
    {
      nombre: string;
      unidadMedida: string;
      puntos: Array<{ fecha: Date; costoUnitario: number }>;
    }
  >();

  for (const c of compras as CompraCruda[]) {
    const id = c.insumo.id;
    if (!porInsumo.has(id)) {
      porInsumo.set(id, {
        nombre: c.insumo.nombre,
        unidadMedida: c.insumo.unidadMedida,
        puntos: [],
      });
    }
    porInsumo.get(id)!.puntos.push({
      fecha: c.factura.fecha,
      costoUnitario: Number(c.costoUnitario),
    });
  }

  // Ordenar los puntos de cada insumo por fecha
  const insumos = Array.from(porInsumo.values())
    .map((ins) => ({
      ...ins,
      puntos: ins.puntos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Evolución de costos</h2>
          <p className="mt-1 text-sm text-corteza-600">
            Historial de costo unitario por insumo a través del tiempo.
          </p>
        </div>
        <Link
          href="/facturas"
          className="rounded-lg border border-masa-200 px-4 py-2.5 font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Volver a facturas
        </Link>
      </div>

      {insumos.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          Aún no hay compras registradas para ver la evolución de costos.
        </section>
      ) : (
        <ul className="space-y-4">
          {insumos.map((ins) => {
            const primero = ins.puntos[0];
            const ultimo = ins.puntos[ins.puntos.length - 1];
            const variacion =
              ins.puntos.length >= 2 && primero.costoUnitario > 0
                ? ((ultimo.costoUnitario - primero.costoUnitario) / primero.costoUnitario) * 100
                : null;

            return (
              <li key={ins.nombre} className="rounded-panel border border-masa-200 bg-white overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-masa-100 bg-masa-50 px-4 py-3">
                  <div>
                    <p className="font-bold text-corteza-900">
                      {ins.nombre}
                      <span className="ml-1.5 text-xs font-normal text-corteza-400">
                        / {ins.unidadMedida}
                      </span>
                    </p>
                    <p className="text-xs text-corteza-400">
                      {ins.puntos.length} {ins.puntos.length === 1 ? "compra" : "compras"}
                    </p>
                  </div>
                  {variacion !== null && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${
                        Math.abs(variacion) < 0.1
                          ? "bg-masa-100 text-corteza-400"
                          : variacion > 0
                          ? "bg-cuadre-mal/10 text-cuadre-mal"
                          : "bg-cuadre-ok/10 text-cuadre-ok"
                      }`}
                    >
                      {variacion > 0 ? "+" : ""}
                      {variacion.toFixed(1)}%
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masa-100 text-xs uppercase tracking-wide text-corteza-400">
                        <th className="px-4 py-2 text-left">Fecha</th>
                        <th className="px-4 py-2 text-right">Costo unitario</th>
                        <th className="px-4 py-2 text-right">Variación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-masa-50">
                      {ins.puntos.map((p, i) => {
                        const anterior = ins.puntos[i - 1];
                        const varPunto =
                          anterior && anterior.costoUnitario > 0
                            ? ((p.costoUnitario - anterior.costoUnitario) / anterior.costoUnitario) * 100
                            : null;
                        return (
                          <tr key={i} className="hover:bg-masa-50">
                            <td className="px-4 py-2.5 text-corteza-600">{fmtFecha.format(p.fecha)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-corteza-900">
                              {dinero(p.costoUnitario)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {varPunto === null ? (
                                <span className="text-corteza-400">—</span>
                              ) : (
                                <span
                                  className={
                                    Math.abs(varPunto) < 0.05
                                      ? "text-corteza-400"
                                      : varPunto > 0
                                      ? "text-cuadre-mal"
                                      : "text-cuadre-ok"
                                  }
                                >
                                  {varPunto > 0 ? "+" : ""}
                                  {varPunto.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
