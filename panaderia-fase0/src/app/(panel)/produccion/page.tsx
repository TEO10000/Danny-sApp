import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { preciosVigentesEn } from "@/lib/catalogo";
import { hoyEcuador } from "@/lib/cierres";
import ListaCoches from "./ListaCoches";
import { unidadesBuenas } from "@/lib/produccion-calculo";

export const dynamic = "force-dynamic";

const CATEGORIAS_CON_VIDA_UTIL = ["PASTELERIA", "GALLETERIA", "EMPAQUETADO"];
const UMBRAL_POR_VENCER = 0.75;

// Tipo local para los campos nuevos de DetalleCoche que el cliente Prisma
// puede no tener hasta regenerar (misma convención que catalogo.ts).
type DetalleRawPage = {
  productoId: string;
  numLatas: number | null;
  panesPorLata: number | null;
  cantidadUnidades: number | null;
  mermas: number;
  agotado: boolean;
  producto: { nombre: string; categoria: string; modoProduccion: string; vidaUtilHoras: number | null };
};

export default async function ProduccionPage({
  searchParams,
}: {
  searchParams: { guardado?: string; editado?: string; recalculado?: string };
}) {
  const session = await auth();
  const rol = session?.user?.rol;
  const userId = session?.user?.id;
  const esAdmin = rol === "ADMIN";
  const esPanadero = rol === "PANADERO";
  const hoy = hoyEcuador();

  const coches = await prisma.cocheProduccion.findMany({
    orderBy: { fecha: "desc" },
    take: 30,
    include: {
      sucursal: { select: { id: true, nombre: true } },
      panadero: { select: { nombre: true } },
      detalles: {
        include: {
          producto: { select: { nombre: true, categoria: true, vidaUtilHoras: true } },
        },
      },
    },
  });

  // Determina turno según hora Ecuador
  function computarTurno(fecha: Date): "T1" | "T2" {
    const horaEC = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Guayaquil",
      hour: "2-digit",
      hour12: false,
    }).format(fecha);
    return parseInt(horaEC, 10) < 14 ? "T1" : "T2";
  }

  const resumen = await Promise.all(
    coches.map(async (c) => {
      const detallesRaw = c.detalles as unknown as DetalleRawPage[];
      let latas = 0, panes = 0, mermas = 0, ingreso: number | null = null;
      if (esAdmin) {
        const precios = await preciosVigentesEn(c.fecha);
        ingreso = 0;
        for (const d of detallesRaw) {
          const buenos = unidadesBuenas({
            numLatas: d.numLatas,
            panesPorLata: d.panesPorLata,
            cantidadUnidades: d.cantidadUnidades,
            mermas: d.mermas,
          });
          latas += d.numLatas ?? 0;
          panes += buenos;
          mermas += d.mermas;
          ingreso += buenos * (precios.get(d.productoId) ?? 0);
        }
        ingreso = Math.round(ingreso * 100) / 100;
      } else {
        for (const d of detallesRaw) {
          const buenos = unidadesBuenas({
            numLatas: d.numLatas,
            panesPorLata: d.panesPorLata,
            cantidadUnidades: d.cantidadUnidades,
            mermas: d.mermas,
          });
          latas += d.numLatas ?? 0;
          panes += buenos;
          mermas += d.mermas;
        }
      }

      const cocheEnEcuador = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Guayaquil",
      }).format(c.fecha);
      const puedeEditar =
        esAdmin ||
        (esPanadero && c.panaderoId === userId && cocheEnEcuador === hoy);

      return {
        coche: {
          ...c,
          // sobrescribir detalles con el tipo extendido que incluye categoria
          detalles: detallesRaw.map((d) => ({
            productoId: d.productoId,
            numLatas: d.numLatas,
            panesPorLata: d.panesPorLata,
            cantidadUnidades: d.cantidadUnidades,
            mermas: d.mermas,
            producto: { nombre: d.producto.nombre, categoria: d.producto.categoria },
          })),
        },
        latas,
        panes,
        mermas,
        ingreso,
        puedeEditar,
        turno: computarTurno(c.fecha),
      };
    })
  );

  // Alerta de vida útil: busca líneas de coches recientes con vencimiento próximo o vencido
  const ahora = new Date();
  type AlertaItem = {
    productoNombre: string;
    sucursalNombre: string;
    horasDesdeHorno: number;
    vidaUtilHoras: number;
    estado: "por_vencer" | "vencido";
  };
  const alertas: AlertaItem[] = [];

  for (const c of coches) {
    const horasDesdeHorno = (ahora.getTime() - c.fecha.getTime()) / 3_600_000;
    if (horasDesdeHorno > 7 * 24) continue;
    for (const d of c.detalles as unknown as DetalleRawPage[]) {
      if (!d.producto.vidaUtilHoras) continue;
      if (!CATEGORIAS_CON_VIDA_UTIL.includes(d.producto.categoria)) continue;
      if (d.agotado) continue;
      const porcentaje = horasDesdeHorno / d.producto.vidaUtilHoras;
      if (porcentaje < UMBRAL_POR_VENCER) continue;
      alertas.push({
        productoNombre: d.producto.nombre,
        sucursalNombre: c.sucursal.nombre,
        horasDesdeHorno: Math.round(horasDesdeHorno * 10) / 10,
        vidaUtilHoras: d.producto.vidaUtilHoras,
        estado: porcentaje >= 1 ? "vencido" : "por_vencer",
      });
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Producción</h2>
          <p className="mt-1 text-sm text-corteza-600">Últimos coches horneados.</p>
        </div>
        <Link
          href="/produccion/nuevo"
          className="rounded-lg bg-horno-500 px-4 py-3 text-touch-lg text-white hover:bg-horno-600 sm:hidden"
        >
          + Registrar
        </Link>
      </div>

      {searchParams.guardado && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Coche guardado correctamente.
        </p>
      )}
      {searchParams.editado && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Coche actualizado.
          {searchParams.recalculado ? " Las ventas del turno afectado fueron recalculadas." : ""}
        </p>
      )}

      {/* Banner de alerta de vencimiento */}
      {alertas.length > 0 && (
        <details className="rounded-panel border border-horno-400/30 bg-horno-500/5 p-4">
          <summary className="cursor-pointer font-semibold text-horno-600">
            ⚠ {alertas.length} {alertas.length === 1 ? "producción para revisar" : "producciones para revisar"}
            {" — "}productos próximos a vencer o vencidos
          </summary>
          <ul className="mt-3 space-y-2">
            {alertas.map((a, i) => (
              <li key={i} className="rounded-lg border border-masa-200 bg-white px-3 py-2 text-sm">
                <span className={`font-semibold ${a.estado === "vencido" ? "text-cuadre-mal" : "text-horno-600"}`}>
                  {a.estado === "vencido" ? "Vencido" : "Por vencer"}
                </span>
                {" · "}
                {a.productoNombre} · {a.sucursalNombre}
                <p className="text-corteza-400">
                  {a.horasDesdeHorno} h desde el horno · vida útil {a.vidaUtilHoras} h
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {resumen.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          Todavía no hay coches registrados. Usá el botón de abajo para registrar el primero.
        </section>
      ) : (
        <ListaCoches resumen={resumen} />
      )}

      {/* FAB — botón flotante para registrar producción */}
      <Link
        href="/produccion/nuevo"
        className="fixed bottom-6 right-6 z-20 hidden rounded-full bg-horno-500 px-5 py-3.5 text-touch-lg text-white shadow-lg hover:bg-horno-600 sm:flex sm:items-center sm:gap-2"
        style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))" }}
      >
        + Agregar Produción
      </Link>
    </div>
  );
}
