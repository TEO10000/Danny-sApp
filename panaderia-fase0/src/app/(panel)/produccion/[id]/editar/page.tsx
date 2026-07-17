import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productosConPrecio } from "@/lib/catalogo";
import { hoyEcuador } from "@/lib/cierres";
import { CocheFormEditar } from "./CocheFormEditar";

export const dynamic = "force-dynamic";

export default async function EditarCochePage({ params }: { params: { id: string } }) {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "PANADERO")) {
    redirect("/produccion");
  }
  const userId = session.user.id;

  const coche = await prisma.cocheProduccion.findUnique({
    where: { id: params.id },
    include: {
      sucursal: { select: { nombre: true } },
      detalles: {
        select: {
          productoId: true,
          numLatas: true,
          panesPorLata: true,
          cantidadUnidades: true,
          mermas: true,
          producto: { select: { nombre: true } },
        },
      },
    },
  });
  if (!coche) notFound();

  if (rol === "PANADERO") {
    if (coche.panaderoId !== userId) redirect("/produccion");
    const cocheEnEcuador = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
    }).format(coche.fecha);
    if (cocheEnEcuador !== hoyEcuador()) redirect("/produccion");
  }

  const [productos, sucursales] = await Promise.all([
    productosConPrecio(true),
    prisma.sucursal.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const fechaEcuador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
  }).format(coche.fecha);
  const horaEcuador = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(coche.fecha);

  const productosParaForm = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precio: rol === "ADMIN" ? p.precioVigente : null,
    modoProduccion: p.modoProduccion,
    categoria: p.categoria,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link href="/produccion" className="text-sm font-semibold text-horno-600 hover:underline">
          ← Volver a Producción
        </Link>
        <h2 className="mt-2 text-xl font-bold text-corteza-900">Editar coche</h2>
        <p className="mt-1 text-sm text-corteza-600">
          {coche.sucursal.nombre} · {fechaEcuador} {horaEcuador}
        </p>
      </div>
      <CocheFormEditar
        cocheId={coche.id}
        productos={productosParaForm}
        sucursales={sucursales}
        initialSucursalId={coche.sucursalId}
        initialFecha={fechaEcuador}
        initialHora={horaEcuador}
        initialNotas={coche.notas ?? ""}
        initialDetalles={coche.detalles.map((d) => ({
          productoId: d.productoId,
          modo: d.cantidadUnidades != null ? ("UNIDADES" as const) : ("LATAS" as const),
          numLatas: d.numLatas,
          panesPorLata: d.panesPorLata,
          cantidadUnidades: d.cantidadUnidades,
          mermas: d.mermas,
        }))}
        mostrarIngreso={rol === "ADMIN"}
      />
    </div>
  );
}
