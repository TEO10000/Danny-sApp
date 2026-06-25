import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { insumosConUltimoCosto } from "@/lib/facturas";
import { FormConEscaner } from "./FormConEscaner";

export const dynamic = "force-dynamic";

function hoyEcuador(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
}

export default async function NuevaFacturaPage() {
  const [proveedores, insumos, sucursales] = await Promise.all([
    prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
    insumosConUltimoCosto(),
    prisma.sucursal.findMany({
      where: { activa: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Registrar factura</h2>
          <p className="mt-1 text-sm text-corteza-600">
            Escanea la factura con IA o ingrésala manualmente.
          </p>
        </div>
        <Link
          href="/facturas"
          className="rounded-lg border border-masa-200 px-4 py-2.5 font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Volver
        </Link>
      </div>

      <FormConEscaner
        proveedores={proveedores}
        insumos={insumos}
        sucursales={sucursales}
        hoy={hoyEcuador()}
      />
    </div>
  );
}
