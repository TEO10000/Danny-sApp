import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productosConPrecio } from "@/lib/catalogo";
import { CocheForm } from "../CocheForm";

export const dynamic = "force-dynamic";

export default async function NuevoCochePage() {
  const session = await auth();
  const esAdmin = session?.user?.rol === "ADMIN";

  const [productos, sucursales] = await Promise.all([
    productosConPrecio(true),
    prisma.sucursal.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  // Hoy y hora actual en Ecuador para los valores por defecto
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
          Aún no hay productos en el catálogo, así que no se puede armar un
          coche. Pide al administrador que agregue los panes y sus precios en la
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-corteza-900">Registrar coche</h2>
        <p className="mt-1 text-sm text-corteza-600">
          Un coche puede llevar varios panes: agrega una fila por cada tipo, con
          sus latas y panes por lata.
        </p>
      </div>
      <CocheForm
        productos={productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: esAdmin ? p.precioVigente : null,
        }))}
        sucursales={sucursales}
        hoy={hoy}
        ahora={ahora}
        mostrarIngreso={esAdmin}
      />
    </div>
  );
}
