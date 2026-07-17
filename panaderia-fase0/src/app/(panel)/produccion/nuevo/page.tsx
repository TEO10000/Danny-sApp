import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productosConPrecio } from "@/lib/catalogo";
import { CocheForm } from "../CocheForm";

export const dynamic = "force-dynamic";

export default async function NuevoCochePage({
  searchParams,
}: {
  searchParams: { duplicarDe?: string };
}) {
  const session = await auth();
  const esAdmin = session?.user?.rol === "ADMIN";

  const [productos, sucursales] = await Promise.all([
    productosConPrecio(true),
    prisma.sucursal.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const ahoraDate = new Date();
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
  }).format(ahoraDate);
  const ahora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahoraDate);

  if (productos.length === 0) {
    return (
      <section className="rounded-panel border border-masa-200 bg-white p-6">
        <h2 className="text-xl font-bold text-corteza-900">Registrar coche</h2>
        <p className="mt-2 text-corteza-600">
          Aún no hay productos en el catálogo. Pide al administrador que agregue los panes en la
          sección Catálogo.
        </p>
        <Link
          href="/produccion"
          className="mt-4 inline-block rounded-lg border border-masa-200 px-4 py-2.5 font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Volver a Producción
        </Link>
      </section>
    );
  }

  // TAREA 4: soporte para duplicar un coche existente
  let initialDetalles: Array<{
    productoId: string;
    modo: "LATAS" | "UNIDADES";
    numLatas?: number | null;
    panesPorLata?: number | null;
    cantidadUnidades?: number | null;
    mermas: number;
  }> | undefined;

  if (searchParams.duplicarDe) {
    const original = await prisma.cocheProduccion.findUnique({
      where: { id: searchParams.duplicarDe },
      select: {
        detalles: {
          select: {
            productoId: true,
            numLatas: true,
            panesPorLata: true,
            cantidadUnidades: true,
            mermas: true,
          },
        },
      },
    });
    if (original) {
      initialDetalles = original.detalles.map((d) => ({
        productoId: d.productoId,
        modo: d.cantidadUnidades != null ? "UNIDADES" : "LATAS",
        numLatas: d.numLatas,
        panesPorLata: d.panesPorLata,
        cantidadUnidades: d.cantidadUnidades,
        mermas: d.mermas,
      }));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/produccion" className="text-sm font-semibold text-horno-600 hover:underline">
          ← Volver a Producción
        </Link>
        <h2 className="mt-2 text-xl font-bold text-corteza-900">
          {initialDetalles ? "Duplicar coche" : "Registrar coche"}
        </h2>
        <p className="mt-1 text-sm text-corteza-600">
          {initialDetalles
            ? "Revisá las cantidades y ajustá lo que haga falta antes de guardar."
            : "Agrega una fila por cada tipo de pan, con sus latas y panes por lata."}
        </p>
      </div>
      <CocheForm
        productos={productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: esAdmin ? p.precioVigente : null,
          modoProduccion: p.modoProduccion,
          categoria: p.categoria,
        }))}
        sucursales={sucursales}
        hoy={hoy}
        ahora={ahora}
        mostrarIngreso={esAdmin}
        initialDetalles={initialDetalles}
      />
    </div>
  );
}
