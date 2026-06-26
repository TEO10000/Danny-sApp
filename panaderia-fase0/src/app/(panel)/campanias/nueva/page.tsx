import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productosConPrecio } from "@/lib/catalogo";
import { CampaniaForm } from "../CampaniaForm";

export const dynamic = "force-dynamic";

export default async function NuevaCampaniaPage() {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    redirect("/campanias?error=permiso");
  }

  const [sucursales, productos] = await Promise.all([
    prisma.sucursal.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
    productosConPrecio(true),
  ]);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-corteza-900">Nueva campaña</h2>
      <div className="rounded-panel border border-masa-200 bg-white p-5">
        <CampaniaForm sucursales={sucursales} productos={productos} />
      </div>
    </div>
  );
}
