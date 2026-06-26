import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productosConPrecio } from "@/lib/catalogo";
import { CampaniaForm } from "../../CampaniaForm";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export default async function EditarCampaniaPage({ params }: Props) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    redirect("/campanias?error=permiso");
  }

  const [campania, sucursales, productos] = await Promise.all([
    prisma.campania.findUnique({
      where: { id: params.id },
      include: { productos: true },
    }),
    prisma.sucursal.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
    productosConPrecio(true),
  ]);

  if (!campania) notFound();

  const inicial = {
    id: campania.id,
    nombre: campania.nombre,
    descripcion: campania.descripcion,
    fechaInicio: campania.fechaInicio.toISOString().slice(0, 10),
    fechaFin: campania.fechaFin.toISOString().slice(0, 10),
    costo: Number(campania.costo),
    sucursalId: campania.sucursalId,
    productosIds: campania.productos.map((cp: { productoId: string }) => cp.productoId),
  };

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-corteza-900">Editar campaña</h2>
      <div className="rounded-panel border border-masa-200 bg-white p-5">
        <CampaniaForm sucursales={sucursales} productos={productos} inicial={inicial} />
      </div>
    </div>
  );
}
