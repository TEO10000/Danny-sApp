import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormEditarFactura } from "./FormEditarFactura";

export const dynamic = "force-dynamic";

export default async function EditarFacturaPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const esAdmin = session.user.rol === "ADMIN";
  const userId = session.user.id!;

  const factura = await prisma.facturaProveedor.findUnique({
    where: { id: params.id },
    include: {
      proveedor: { select: { nombre: true } },
      compras: {
        include: { insumo: { select: { id: true, nombre: true, unidadMedida: true } } },
      },
    },
  });
  if (!factura) notFound();

  // Permisos: PENDIENTE → solo quien la registró o ADMIN; PAGADA → solo ADMIN
  if (factura.estado === "ANULADA") redirect("/facturas?error=anulada");
  if (factura.estado === "PAGADA" && !esAdmin) redirect("/facturas?error=permiso");
  if (factura.estado === "PENDIENTE" && !esAdmin && factura.registradaPorId !== userId) {
    redirect("/facturas?error=permiso");
  }

  const [proveedores, sucursales, insumos] = await Promise.all([
    prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.sucursal.findMany({ orderBy: { nombre: "asc" } }),
    prisma.insumo.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/facturas" className="text-sm font-semibold text-horno-600 hover:underline">
          ← Volver a Facturas
        </Link>
        <h2 className="mt-2 text-xl font-bold text-corteza-900">Editar factura</h2>
        <p className="mt-1 text-sm text-corteza-600">
          {factura.proveedor.nombre} ·{" "}
          <span className={`font-semibold ${factura.estado === "PAGADA" ? "text-cuadre-ok" : "text-horno-600"}`}>
            {factura.estado === "PAGADA" ? "Pagada" : "Pendiente"}
          </span>
          {factura.estado === "PAGADA" && !esAdmin && " — Solo el administrador puede editar facturas pagadas."}
        </p>
      </div>

      <FormEditarFactura
        facturaId={factura.id}
        initialProveedorId={factura.proveedorId}
        initialSucursalId={factura.sucursalId}
        initialFecha={factura.fecha.toISOString().slice(0, 10)}
        initialNumero={factura.numero ?? ""}
        initialAplicaIva={factura.aplicaIva}
        initialLineas={factura.compras.map((c) => ({
          insumoId: c.insumoId,
          insumoNombre: c.insumo.nombre,
          cantidad: Number(c.cantidad),
          costoTotal: Number(c.costoTotal),
        }))}
        proveedores={proveedores.map((p) => ({ id: p.id, nombre: p.nombre }))}
        sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
        insumos={insumos.map((i) => ({ id: i.id, nombre: i.nombre, unidadMedida: i.unidadMedida }))}
      />
    </div>
  );
}
