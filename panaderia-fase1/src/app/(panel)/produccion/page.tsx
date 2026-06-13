import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { preciosVigentesEn, dinero } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "America/Guayaquil",
});

export default async function ProduccionPage({
  searchParams,
}: {
  searchParams: { guardado?: string };
}) {
  const coches = await prisma.cocheProduccion.findMany({
    orderBy: { fecha: "desc" },
    take: 30,
    include: {
      sucursal: true,
      panadero: { select: { nombre: true } },
      detalles: { include: { producto: { select: { nombre: true } } } },
    },
  });

  // Valorar cada coche con el precio vigente EN su fecha (no el de hoy)
  type CocheListado = {
    id: string;
    fecha: Date;
    notas: string | null;
    sucursal: { nombre: string };
    panadero: { nombre: string };
    detalles: Array<{
      productoId: string;
      numLatas: number;
      panesPorLata: number;
      mermas: number;
      producto: { nombre: string };
    }>;
  };
  const resumen = await Promise.all(
    (coches as CocheListado[]).map(async (c) => {
      const precios = await preciosVigentesEn(c.fecha);
      let latas = 0;
      let panes = 0;
      let mermas = 0;
      let ingreso = 0;
      for (const d of c.detalles) {
        latas += d.numLatas;
        panes += d.numLatas * d.panesPorLata;
        mermas += d.mermas;
        const buenos = Math.max(d.numLatas * d.panesPorLata - d.mermas, 0);
        ingreso += buenos * (precios.get(d.productoId) ?? 0);
      }
      return { coche: c, latas, panes, mermas, ingreso };
    })
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Producción</h2>
          <p className="mt-1 text-sm text-corteza-600">Últimos coches horneados.</p>
        </div>
        <Link
          href="/produccion/nuevo"
          className="rounded-lg bg-horno-500 px-4 py-3 text-touch-lg text-white hover:bg-horno-600"
        >
          + Registrar coche
        </Link>
      </div>

      {searchParams.guardado && (
        <p
          role="status"
          className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok"
        >
          Coche guardado correctamente.
        </p>
      )}

      {resumen.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          Todavía no hay coches registrados. El primero de la semana se registra
          con el botón de arriba: sucursal, latas y panes por lata.
        </section>
      ) : (
        <ul className="space-y-3">
          {resumen.map(({ coche, latas, panes, mermas, ingreso }) => (
            <li key={coche.id} className="rounded-panel border border-masa-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-corteza-900">
                  {fmtFecha.format(coche.fecha)} · {coche.sucursal.nombre}
                </p>
                <p className="font-bold text-cuadre-ok">{dinero(ingreso)} est.</p>
              </div>
              <p className="mt-1 text-sm text-corteza-600">
                {coche.detalles
                  .map((d) => `${d.producto.nombre} (${d.numLatas}×${d.panesPorLata})`)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sm text-corteza-400">
                {latas} latas · {panes} panes
                {mermas > 0 ? ` · ${mermas} mermas` : ""} · {coche.panadero.nombre}
                {coche.notas ? ` · "${coche.notas}"` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
