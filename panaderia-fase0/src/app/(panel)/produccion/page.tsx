import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { preciosVigentesEn, dinero } from "@/lib/catalogo";
import { hoyEcuador } from "@/lib/cierres";
import ListaCoches from "./ListaCoches";

export const dynamic = "force-dynamic";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

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
      sucursal: true,
      panadero: { select: { nombre: true } },
      detalles: { include: { producto: { select: { nombre: true } } } },
    },
  });

  type CocheListado = {
    id: string;
    fecha: Date;
    panaderoId: string;
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

  // RF-P07: no ejecutar consultas monetarias para PANADERO
  const resumen = await Promise.all(
    (coches as CocheListado[]).map(async (c) => {
      let latas = 0, panes = 0, mermas = 0, ingreso: number | null = null;
      if (esAdmin) {
        const precios = await preciosVigentesEn(c.fecha);
        ingreso = 0;
        for (const d of c.detalles) {
          latas += d.numLatas;
          panes += d.numLatas * d.panesPorLata;
          mermas += d.mermas;
          const buenos = Math.max(d.numLatas * d.panesPorLata - d.mermas, 0);
          ingreso += buenos * (precios.get(d.productoId) ?? 0);
        }
      } else {
        for (const d of c.detalles) {
          latas += d.numLatas;
          panes += d.numLatas * d.panesPorLata;
          mermas += d.mermas;
        }
      }

      // Puede editar: ADMIN siempre; PANADERO solo si es suyo y es de hoy
      const cocheEnEcuador = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Guayaquil",
      }).format(c.fecha);
      const puedeEditar =
        esAdmin ||
        (esPanadero && c.panaderoId === userId && cocheEnEcuador === hoy);

      return { coche: c, latas, panes, mermas, ingreso, puedeEditar };
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

      {resumen.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          Todavía no hay coches registrados. El primero de la semana se registra
          con el botón de arriba: sucursal, latas y panes por lata.
        </section>
      ) : (
        <ListaCoches resumen={resumen} />
      )}
    </div>
  );
}
