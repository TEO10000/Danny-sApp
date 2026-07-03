import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dinero } from "@/lib/catalogo";
import { FiltroDashboard } from "./FiltroDashboard";

export const dynamic = "force-dynamic";

// ── Tipos locales ──────────────────────────────────────────────────────────

type VentaFila = {
  id: string;
  sucursalId: string;
  fecha: Date;
  tipoTurno: string;
  productoId: string;
  cantidad: number;
  valor: unknown;
  producto: { nombre: string };
};

type CocheFila = {
  id: string;
  fecha: Date;
  sucursalId: string;
  detalles: Array<{
    productoId: string;
    numLatas: number;
    panesPorLata: number;
    mermas: number;
  }>;
};

type FacturaFila = {
  id: string;
  montoTotal: unknown;
  estado: string;
  sucursalId: string;
  compras: Array<{
    insumoId: string;
    costoTotal: unknown;
    insumo: { nombre: string };
  }>;
};

type CierreFila = {
  id: string;
  fecha: Date;
  tipoTurno: string;
  descuadre: unknown;
  efectivoEsperado: unknown;
  totalTransferencias: unknown;
  empleada: { nombre: string };
  sucursal: { nombre: string };
};

type PrecioFila = {
  productoId: string;
  precio: unknown;
  vigenteDesde: Date;
};

// ── Gráfico de barras SVG ──────────────────────────────────────────────────

function GraficoBarras({
  datos,
  color = "#d97706",
}: {
  datos: Array<{ etiqueta: string; valor: number }>;
  color?: string;
}) {
  if (datos.length === 0) return null;
  const max = Math.max(...datos.map((d) => d.valor), 0.01);
  const anchoBar = 18;
  const gap = 4;
  const altoArea = 72;
  const altoTotal = altoArea + 18;
  const anchoTotal = Math.max(datos.length * (anchoBar + gap), 1);

  return (
    <svg
      viewBox={`0 0 ${anchoTotal} ${altoTotal}`}
      className="w-full"
      role="img"
      aria-label="Gráfico de barras"
    >
      {datos.map((d, i) => {
        const h = Math.max((d.valor / max) * altoArea, 0);
        const x = i * (anchoBar + gap);
        return (
          <g key={i}>
            <rect x={x} y={altoArea - h} width={anchoBar} height={h} rx={2} fill={color} />
            <text
              x={x + anchoBar / 2}
              y={altoTotal - 3}
              textAnchor="middle"
              fontSize={7}
              fill="#78716c"
            >
              {d.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SinDatos() {
  return (
    <p className="text-sm text-corteza-400 py-2">Sin datos en el período seleccionado.</p>
  );
}

// ── Página principal ───────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { sucursal?: string; desde?: string; hasta?: string };
}) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    redirect("/dashboard?error=permiso");
  }

  // Rango de fechas (default: últimos 30 días en Ecuador UTC−5)
  const fmtEC = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" });
  const hoy = fmtEC.format(new Date());
  const hace30 = fmtEC.format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const desde = searchParams.desde ?? hace30;
  const hasta = searchParams.hasta ?? hoy;
  const filtroSucursal = searchParams.sucursal ?? "";

  const desdeDate = new Date(desde + "T00:00:00-05:00");
  const hastaDate = new Date(hasta + "T23:59:59-05:00");
  const sucursalWhere = filtroSucursal ? { sucursalId: filtroSucursal } : {};

  // ── Carga paralela de datos ─────────────────────────────────────────────
  const [sucursales, ventas, coches, facturas, cierres, preciosHistorial] =
    await Promise.all([
      prisma.sucursal.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
      prisma.ventaCalculada.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaDate }, ...sucursalWhere },
        include: { producto: { select: { nombre: true } } },
      }),
      prisma.cocheProduccion.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaDate }, ...sucursalWhere },
        include: {
          detalles: {
            select: { productoId: true, numLatas: true, panesPorLata: true, mermas: true },
          },
        },
      }),
      prisma.facturaProveedor.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaDate }, ...sucursalWhere },
        include: {
          compras: { include: { insumo: { select: { nombre: true } } } },
        },
      }),
      prisma.cierreTurno.findMany({
        where: { fecha: { gte: desdeDate, lte: hastaDate }, ...sucursalWhere },
        include: {
          empleada: { select: { nombre: true } },
          sucursal: { select: { nombre: true } },
        },
      }),
      prisma.precioProducto.findMany({ orderBy: { vigenteDesde: "desc" } }),
    ]);

  // ── Precio de producto en una fecha dada ───────────────────────────────
  function precioEnFecha(productoId: string, fecha: Date): number | null {
    const encontrado = (preciosHistorial as PrecioFila[]).find(
      (p) => p.productoId === productoId && p.vigenteDesde <= fecha
    );
    return encontrado ? Number(encontrado.precio) : null;
  }

  // ── 1. VENTAS ───────────────────────────────────────────────────────────
  const ventasFilas = ventas as VentaFila[];
  const totalVentas = ventasFilas.reduce((s, v) => s + Number(v.valor), 0);

  // Serie por día (etiqueta: "DD mmm")
  const fmtDia = new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const ventasPorDia = new Map<string, { etiqueta: string; valor: number }>();
  for (const v of ventasFilas) {
    const clave = v.fecha.toISOString().slice(0, 10);
    const entry = ventasPorDia.get(clave) ?? {
      etiqueta: fmtDia.format(v.fecha),
      valor: 0,
    };
    entry.valor += Number(v.valor);
    ventasPorDia.set(clave, entry);
  }
  const serieVentas = [...ventasPorDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // Top y bottom productos
  const ventasPorProducto = new Map<string, { nombre: string; valor: number }>();
  for (const v of ventasFilas) {
    const e = ventasPorProducto.get(v.productoId) ?? { nombre: v.producto.nombre, valor: 0 };
    e.valor += Number(v.valor);
    ventasPorProducto.set(v.productoId, e);
  }
  const productosOrdenados = [...ventasPorProducto.values()].sort((a, b) => b.valor - a.valor);
  const topProductos = productosOrdenados.slice(0, 5);

  // ── 2. PRODUCCIÓN Y GANANCIA ────────────────────────────────────────────
  let totalProduccion = 0;
  let totalMermas = 0;
  let ingresoEstimado = 0;

  for (const coche of coches as CocheFila[]) {
    for (const det of coche.detalles) {
      const producido = det.numLatas * det.panesPorLata;
      const merma = det.mermas;
      const efectivo = Math.max(producido - merma, 0);
      totalProduccion += producido;
      totalMermas += merma;
      const precio = precioEnFecha(det.productoId, coche.fecha);
      if (precio) ingresoEstimado += efectivo * precio;
    }
  }
  ingresoEstimado = Math.round(ingresoEstimado * 100) / 100;

  // ── 3. COSTOS DE INSUMOS ────────────────────────────────────────────────
  const facturasFilas = (facturas as FacturaFila[]).filter((f) => f.estado !== "ANULADA");
  const totalCostos = facturasFilas.reduce((s, f) => s + Number(f.montoTotal), 0);

  const costosPorInsumo = new Map<string, { nombre: string; total: number }>();
  for (const f of facturasFilas) {
    for (const c of f.compras) {
      const e = costosPorInsumo.get(c.insumoId) ?? {
        nombre: c.insumo.nombre,
        total: 0,
      };
      e.total += Number(c.costoTotal);
      costosPorInsumo.set(c.insumoId, e);
    }
  }
  const topInsumos = [...costosPorInsumo.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // ── 4. CAJA ─────────────────────────────────────────────────────────────
  const cierresFilas = cierres as CierreFila[];
  const totalDescuadre = Math.round(
    cierresFilas.reduce((s, c) => s + Number(c.descuadre), 0) * 100
  ) / 100;

  // Desglose por canal: efectivo = (efectivoEsperado - 40), transferencias = totalTransferencias
  const totalEfectivoCanal = Math.round(
    cierresFilas.reduce((s, c) => s + Number(c.efectivoEsperado) - 40, 0) * 100
  ) / 100;
  const totalTransferenciasCanal = Math.round(
    cierresFilas.reduce((s, c) => s + Number(c.totalTransferencias), 0) * 100
  ) / 100;

  const fmtFechaCierre = new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const mayoresDescuadres = [...cierresFilas]
    .filter((c) => Math.abs(Number(c.descuadre)) >= 0.01)
    .sort((a, b) => Math.abs(Number(b.descuadre)) - Math.abs(Number(a.descuadre)))
    .slice(0, 5);

  // ── 5. FACTURAS PENDIENTES vs PAGADAS ──────────────────────────────────
  const todasFacturas = facturas as FacturaFila[];
  const pendientes = todasFacturas.filter((f) => f.estado === "PENDIENTE");
  const pagadas = todasFacturas.filter((f) => f.estado === "PAGADA");
  const totalPendiente = pendientes.reduce((s, f) => s + Number(f.montoTotal), 0);
  const totalPagado = pagadas.reduce((s, f) => s + Number(f.montoTotal), 0);

  // ── URL para exportación CSV ────────────────────────────────────────────
  const exportParams = new URLSearchParams({ desde, hasta });
  if (filtroSucursal) exportParams.set("sucursal", filtroSucursal);
  const urlExport = `/api/dashboard/export?${exportParams.toString()}`;

  // ── Etiqueta de sucursal seleccionada ───────────────────────────────────
  const nombreSucursal = filtroSucursal
    ? (sucursales.find((s) => s.id === filtroSucursal)?.nombre ?? "Sucursal")
    : "Consolidado";

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Dashboard</h2>
          <p className="mt-1 text-sm text-corteza-600">
            {nombreSucursal} · {desde} → {hasta}
          </p>
        </div>
        <a
          href={urlExport}
          download
          className="rounded-lg border border-masa-200 bg-white px-4 py-2.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Exportar ventas CSV
        </a>
      </div>

      {/* Error de permiso */}
      {(searchParams as { error?: string }).error === "permiso" && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          Solo los administradores pueden ver el dashboard.
        </p>
      )}

      {/* Filtros */}
      <div className="rounded-panel border border-masa-200 bg-white p-4">
        <FiltroDashboard
          sucursales={sucursales}
          sucursalActual={filtroSucursal}
          desdeActual={desde}
          hastaActual={hasta}
        />
      </div>

      {/* ── 1. Ventas ── */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-bold text-corteza-900">Ventas del período</h3>
          <span className="text-2xl font-bold text-horno-600">{dinero(totalVentas)}</span>
        </div>

        {serieVentas.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[280px]">
              <GraficoBarras datos={serieVentas} color="#d97706" />
            </div>
          </div>
        )}

        {topProductos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-corteza-600 mb-2">Más vendidos</p>
            <ul className="space-y-1">
              {topProductos.map((p) => (
                <li key={p.nombre} className="flex justify-between text-sm">
                  <span className="text-corteza-700">{p.nombre}</span>
                  <span className="font-semibold text-corteza-900">{dinero(p.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── 2. Producción ── */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-3">
        <h3 className="font-bold text-corteza-900">Producción del período</h3>
        {totalProduccion === 0 ? (
          <SinDatos />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-masa-50 p-3 text-center">
              <p className="text-2xl font-bold text-corteza-900">
                {totalProduccion.toLocaleString("es-EC")}
              </p>
              <p className="text-xs text-corteza-600 mt-0.5">Panes producidos</p>
            </div>
            <div className="rounded-lg bg-masa-50 p-3 text-center">
              <p className="text-2xl font-bold text-corteza-900">
                {totalMermas.toLocaleString("es-EC")}
              </p>
              <p className="text-xs text-corteza-600 mt-0.5">Mermas</p>
            </div>
            <div className="rounded-lg bg-horno-500/10 p-3 text-center">
              <p className="text-2xl font-bold text-horno-700">{dinero(ingresoEstimado)}</p>
              <p className="text-xs text-corteza-600 mt-0.5">Ingreso estimado</p>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Costos de insumos ── */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-bold text-corteza-900">Costos de insumos</h3>
          <span className="text-xl font-bold text-corteza-900">{dinero(totalCostos)}</span>
        </div>
        {topInsumos.length === 0 ? (
          <SinDatos />
        ) : (
          <ul className="space-y-1">
            {topInsumos.map((ins) => (
              <li key={ins.nombre} className="flex justify-between text-sm">
                <span className="text-corteza-700">{ins.nombre}</span>
                <span className="font-semibold text-corteza-900">{dinero(ins.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 4. Caja ── */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-bold text-corteza-900">Caja del período</h3>
          <span
            className={`text-xl font-bold ${
              Math.abs(totalDescuadre) < 0.005
                ? "text-cuadre-ok"
                : totalDescuadre < 0
                ? "text-cuadre-mal"
                : "text-corteza-900"
            }`}
          >
            {totalDescuadre === 0
              ? "Cuadra"
              : `${totalDescuadre < 0 ? "Falta" : "Sobra"} ${dinero(Math.abs(totalDescuadre))}`}
          </span>
        </div>

        {cierresFilas.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-masa-50 p-3">
              <p className="text-lg font-bold text-corteza-900">{dinero(totalEfectivoCanal)}</p>
              <p className="text-xs text-corteza-600 mt-0.5">Efectivo (caja)</p>
            </div>
            {totalTransferenciasCanal > 0 && (
              <div className="rounded-lg bg-horno-500/10 p-3">
                <p className="text-lg font-bold text-horno-700">{dinero(totalTransferenciasCanal)}</p>
                <p className="text-xs text-corteza-600 mt-0.5">Transferencias</p>
              </div>
            )}
          </div>
        )}

        {mayoresDescuadres.length === 0 ? (
          <p className="text-sm text-cuadre-ok">Todos los turnos cuadraron en este período.</p>
        ) : (
          <ul className="space-y-1">
            {mayoresDescuadres.map((c) => {
              const d = Number(c.descuadre);
              return (
                <li key={c.id} className="flex justify-between text-sm">
                  <span className="text-corteza-600">
                    {fmtFechaCierre.format(c.fecha)} · {c.sucursal.nombre} · {c.empleada.nombre}
                  </span>
                  <span className={`font-semibold ${d < 0 ? "text-cuadre-mal" : "text-corteza-900"}`}>
                    {d < 0 ? `−${dinero(Math.abs(d))}` : `+${dinero(d)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 5. Facturas ── */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-3">
        <h3 className="font-bold text-corteza-900">Facturas del período</h3>
        {todasFacturas.length === 0 ? (
          <SinDatos />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-horno-500/10 p-3">
              <p className="text-xl font-bold text-horno-700">{dinero(totalPendiente)}</p>
              <p className="text-xs text-corteza-600 mt-0.5">
                Pendientes · {pendientes.length} fact.
              </p>
            </div>
            <div className="rounded-lg bg-cuadre-ok/10 p-3">
              <p className="text-xl font-bold text-cuadre-ok">{dinero(totalPagado)}</p>
              <p className="text-xs text-corteza-600 mt-0.5">
                Pagadas · {pagadas.length} fact.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
