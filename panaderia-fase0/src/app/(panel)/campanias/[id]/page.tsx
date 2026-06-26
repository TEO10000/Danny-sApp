import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dinero } from "@/lib/catalogo";
import { hoyEcuador } from "@/lib/cierres";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

type ProductoCampaniaFila = {
  productoId: string;
  campaniaId: string;
  producto: { id: string; nombre: string };
};

type CampaniaFila = {
  id: string;
  nombre: string;
  descripcion: string | null;
  fechaInicio: Date;
  fechaFin: Date;
  costo: unknown;
  sucursalId: string | null;
  productos: ProductoCampaniaFila[];
};

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

function variacionClase(v: number | null): string {
  if (v === null) return "text-corteza-500";
  return v > 0 ? "text-cuadre-ok font-bold" : v < 0 ? "text-cuadre-mal font-bold" : "text-corteza-700";
}

function fmtVariacion(v: number | null): string {
  if (v === null) return "—";
  const signo = v > 0 ? "+" : "";
  return `${signo}${Math.round(v * 10) / 10}%`;
}

export default async function MetricasCampaniaPage({ params }: Props) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    redirect("/campanias?error=permiso");
  }

  const [campania, sucursales] = await Promise.all([
    prisma.campania.findUnique({
      where: { id: params.id },
      include: {
        productos: { include: { producto: { select: { id: true, nombre: true } } } },
      },
    }),
    prisma.sucursal.findMany({ select: { id: true, nombre: true } }),
  ]);

  if (!campania) notFound();

  const c = campania as unknown as CampaniaFila;
  const mapaSucursales = new Map(sucursales.map((s) => [s.id, s.nombre]));

  // Fechas del período campaña
  const fechaInicio = new Date(c.fechaInicio.toISOString().slice(0, 10) + "T00:00:00-05:00");
  const fechaFin = new Date(c.fechaFin.toISOString().slice(0, 10) + "T23:59:59-05:00");

  // Período base: mismo número de días, justo antes
  const duracionMs = c.fechaFin.getTime() - c.fechaInicio.getTime();
  const duracionDias = Math.round(duracionMs / (1000 * 60 * 60 * 24));
  const baseHasta = new Date(c.fechaInicio.getTime() - 24 * 60 * 60 * 1000);
  const baseDesde = new Date(baseHasta.getTime() - duracionDias * 24 * 60 * 60 * 1000);

  const baseDesdeDate = new Date(baseDesde.toISOString().slice(0, 10) + "T00:00:00-05:00");
  const baseHastaDate = new Date(baseHasta.toISOString().slice(0, 10) + "T23:59:59-05:00");

  const sucursalWhere = c.sucursalId ? { sucursalId: c.sucursalId } : {};
  const productosIds = c.productos.map((cp) => cp.producto.id);

  const [ventasCampaniaRaw, ventasBaseRaw, ventasCampaniaProd, ventasBaseProd] = await Promise.all([
    prisma.ventaCalculada.aggregate({
      where: { fecha: { gte: fechaInicio, lte: fechaFin }, ...sucursalWhere },
      _sum: { valor: true },
    }),
    prisma.ventaCalculada.aggregate({
      where: { fecha: { gte: baseDesdeDate, lte: baseHastaDate }, ...sucursalWhere },
      _sum: { valor: true },
    }),
    prisma.ventaCalculada.groupBy({
      by: ["productoId"],
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin },
        productoId: { in: productosIds },
        ...sucursalWhere,
      },
      _sum: { valor: true },
    }),
    prisma.ventaCalculada.groupBy({
      by: ["productoId"],
      where: {
        fecha: { gte: baseDesdeDate, lte: baseHastaDate },
        productoId: { in: productosIds },
        ...sucursalWhere,
      },
      _sum: { valor: true },
    }),
  ]);

  const ventasCampania = ventasCampaniaRaw._sum.valor
    ? Number(ventasCampaniaRaw._sum.valor)
    : null;
  const ventasBase = ventasBaseRaw._sum.valor ? Number(ventasBaseRaw._sum.valor) : null;

  let variacionTotal: number | null = null;
  let retornoEstimado: number | null = null;
  if (ventasCampania !== null && ventasBase !== null && ventasBase > 0) {
    variacionTotal = ((ventasCampania - ventasBase) / ventasBase) * 100;
    retornoEstimado =
      Math.round((ventasCampania - ventasBase - Number(c.costo)) * 100) / 100;
  } else if (ventasCampania !== null && ventasBase !== null) {
    retornoEstimado = Math.round((ventasCampania - Number(c.costo)) * 100) / 100;
  }

  type GrupoVenta = { productoId: string; _sum: { valor: unknown } };

  const mapaVentasCampania = new Map(
    (ventasCampaniaProd as GrupoVenta[]).map((v) => [v.productoId, Number(v._sum.valor ?? 0)])
  );
  const mapaVentasBase = new Map(
    (ventasBaseProd as GrupoVenta[]).map((v) => [v.productoId, Number(v._sum.valor ?? 0)])
  );

  const hoy = hoyEcuador();
  const inicioStr = c.fechaInicio.toISOString().slice(0, 10);
  const finStr = c.fechaFin.toISOString().slice(0, 10);
  let estado = "Finalizada";
  if (hoy < inicioStr) estado = "Próxima";
  else if (hoy <= finStr) estado = "Activa";

  void estado;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">{c.nombre}</h2>
          {c.descripcion && (
            <p className="mt-0.5 text-sm text-corteza-500">{c.descripcion}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/campanias/${c.id}/editar`}
            className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
          >
            Editar
          </Link>
          <Link
            href="/campanias"
            className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
          >
            ← Volver
          </Link>
        </div>
      </div>

      {/* Info básica */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-corteza-400">Inicio</p>
          <p className="font-semibold text-corteza-800">{fmtFecha.format(c.fechaInicio)}</p>
        </div>
        <div>
          <p className="text-xs text-corteza-400">Fin</p>
          <p className="font-semibold text-corteza-800">{fmtFecha.format(c.fechaFin)}</p>
        </div>
        <div>
          <p className="text-xs text-corteza-400">Sucursal</p>
          <p className="font-semibold text-corteza-800">
            {c.sucursalId
              ? (mapaSucursales.get(c.sucursalId) ?? "—")
              : "Ambas sucursales"}
          </p>
        </div>
        <div>
          <p className="text-xs text-corteza-400">Costo</p>
          <p className="font-semibold text-corteza-800">{dinero(Number(c.costo))}</p>
        </div>
      </section>

      {/* Métricas generales */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-4">
        <h3 className="font-bold text-corteza-900">Comparación de ventas</h3>
        <p className="text-xs text-corteza-400">
          Período base: {fmtFecha.format(baseDesde)} → {fmtFecha.format(baseHasta)} (
          {duracionDias + 1} días)
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-masa-50 p-3">
            <p className="text-xs text-corteza-400">Ventas campaña</p>
            <p className="text-xl font-bold text-corteza-900">
              {ventasCampania !== null ? dinero(ventasCampania) : "Sin datos"}
            </p>
          </div>
          <div className="rounded-lg bg-masa-50 p-3">
            <p className="text-xs text-corteza-400">Ventas período base</p>
            <p className="text-xl font-bold text-corteza-900">
              {ventasBase !== null ? dinero(ventasBase) : "Sin datos"}
            </p>
          </div>
          <div className="rounded-lg bg-masa-50 p-3">
            <p className="text-xs text-corteza-400">Variación</p>
            <p className={`text-xl ${variacionClase(variacionTotal)}`}>
              {fmtVariacion(variacionTotal)}
            </p>
          </div>
          <div
            className={`rounded-lg p-3 ${
              retornoEstimado !== null && retornoEstimado >= 0
                ? "bg-cuadre-ok/10"
                : "bg-cuadre-mal/10"
            }`}
          >
            <p className="text-xs text-corteza-400">Retorno estimado</p>
            <p
              className={`text-xl font-bold ${
                retornoEstimado !== null && retornoEstimado >= 0
                  ? "text-cuadre-ok"
                  : "text-cuadre-mal"
              }`}
            >
              {retornoEstimado !== null ? dinero(retornoEstimado) : "Sin datos"}
            </p>
          </div>
        </div>
      </section>

      {/* Métricas por producto */}
      {c.productos.length > 0 && (
        <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-3">
          <h3 className="font-bold text-corteza-900">Productos de la campaña</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-masa-200 text-left text-xs text-corteza-400">
                  <th className="pb-2 font-semibold">Producto</th>
                  <th className="pb-2 font-semibold text-right">Ventas campaña</th>
                  <th className="pb-2 font-semibold text-right">Ventas base</th>
                  <th className="pb-2 font-semibold text-right">Variación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-masa-100">
                {c.productos.map((cp) => {
                  const vc = mapaVentasCampania.get(cp.producto.id) ?? null;
                  const vb = mapaVentasBase.get(cp.producto.id) ?? null;
                  const varProd =
                    vc !== null && vb !== null && vb > 0
                      ? ((vc - vb) / vb) * 100
                      : null;
                  return (
                    <tr key={cp.producto.id}>
                      <td className="py-2 text-corteza-700">{cp.producto.nombre}</td>
                      <td className="py-2 text-right text-corteza-900">
                        {vc !== null ? dinero(vc) : "Sin datos"}
                      </td>
                      <td className="py-2 text-right text-corteza-900">
                        {vb !== null ? dinero(vb) : "Sin datos"}
                      </td>
                      <td className={`py-2 text-right ${variacionClase(varProd)}`}>
                        {fmtVariacion(varProd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-corteza-400 italic">
        Las comparaciones son estimadas; no incluyen factores externos al sistema.
      </p>
    </div>
  );
}
