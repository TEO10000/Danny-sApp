import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dinero } from "@/lib/catalogo";
import { pagarFacturaJefe, anularFactura, revertirPagoFactura } from "./actions";
import { FiltroSucursal } from "./FiltroSucursal";

export const dynamic = "force-dynamic";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

type EstadoBadge = "PENDIENTE" | "PAGADA" | "PAGO_PARCIAL" | "ANULADA";

function BadgeEstado({ estado }: { estado: EstadoBadge }) {
  const cls: Record<EstadoBadge, string> = {
    PENDIENTE: "bg-horno-500/10 text-horno-600",
    PAGADA: "bg-cuadre-ok/10 text-cuadre-ok",
    PAGO_PARCIAL: "bg-yellow-100 text-yellow-700",
    ANULADA: "bg-masa-200 text-corteza-400",
  };
  const etiqueta: Record<EstadoBadge, string> = {
    PENDIENTE: "Pendiente",
    PAGADA: "Pagada",
    PAGO_PARCIAL: "Pago parcial",
    ANULADA: "Anulada",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls[estado]}`}>
      {etiqueta[estado]}
    </span>
  );
}

type FacturaListada = {
  id: string;
  numero: string | null;
  fecha: Date;
  montoTotal: unknown;
  aplicaIva: boolean;
  subtotal: unknown;
  iva: unknown;
  estado: EstadoBadge;
  origenPago: string | null;
  registradaPorId: string;
  proveedor: { nombre: string };
  sucursal: { nombre: string };
  registradaPor: { nombre: string };
  pagadaPor: { nombre: string } | null;
  compras: Array<{
    cantidad: unknown;
    insumo: { nombre: string; unidadMedida: string };
  }>;
};

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: {
    estado?: string;
    sucursal?: string;
    guardado?: string;
    pagado?: string;
    anulada?: string;
    editada?: string;
    revertida?: string;
    error?: string;
  };
}) {
  const session = await auth();
  const esAdmin = session?.user?.rol === "ADMIN";
  const userId = session?.user?.id ?? "";

  const filtroEstado = searchParams.estado ?? "PENDIENTE";
  const filtroSucursal = searchParams.sucursal ?? "";

  const whereEstado =
    filtroEstado === "TODAS"
      ? {}
      : { estado: filtroEstado as EstadoBadge };

  const whereSucursal = filtroSucursal ? { sucursalId: filtroSucursal } : {};

  const [facturas, sucursales] = await Promise.all([
    prisma.facturaProveedor.findMany({
      where: { ...whereEstado, ...whereSucursal },
      orderBy: { fecha: "desc" },
      take: 60,
      include: {
        proveedor: { select: { nombre: true } },
        sucursal: { select: { nombre: true } },
        registradaPor: { select: { nombre: true } },
        pagadaPor: { select: { nombre: true } },
        compras: {
          include: { insumo: { select: { nombre: true, unidadMedida: true } } },
        },
      },
    }),
    prisma.sucursal.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);

  const estados = [
    { valor: "PENDIENTE", etiqueta: "Pendientes" },
    { valor: "PAGADA", etiqueta: "Pagadas" },
    { valor: "TODAS", etiqueta: "Todas" },
  ];

  const buildUrl = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ estado: filtroEstado, ...(filtroSucursal && { sucursal: filtroSucursal }), ...params });
    return `/facturas?${sp.toString()}`;
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Facturas de proveedores</h2>
          <p className="mt-1 text-sm text-corteza-600">
            Registro de compras, estados de pago y evolución de costos.
          </p>
        </div>
        <Link
          href="/facturas/nueva"
          className="rounded-lg bg-horno-500 px-4 py-3 text-touch-lg text-white hover:bg-horno-600"
        >
          + Registrar factura
        </Link>
      </div>

      {/* Mensajes de estado */}
      {searchParams.guardado && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Factura guardada correctamente.
        </p>
      )}
      {searchParams.pagado && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Factura marcada como pagada.
        </p>
      )}
      {searchParams.anulada && (
        <p role="status" className="rounded-lg bg-masa-200 px-3 py-2 text-sm font-medium text-corteza-600">
          Factura anulada.
        </p>
      )}
      {searchParams.editada && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Factura actualizada correctamente.
        </p>
      )}
      {searchParams.revertida && (
        <p role="status" className="rounded-lg bg-masa-200 px-3 py-2 text-sm font-medium text-corteza-600">
          Pago revertido. La factura volvió a Pendiente.
        </p>
      )}
      {(searchParams.error === "permiso" || searchParams.error === "anulada") && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          {searchParams.error === "anulada"
            ? "Las facturas anuladas no se pueden editar."
            : "No tienes permiso para realizar esa acción."}
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-lg border border-masa-200 overflow-hidden">
          {estados.map((e) => (
            <Link
              key={e.valor}
              href={buildUrl({ estado: e.valor })}
              className={`px-3 py-2 text-sm font-semibold ${
                filtroEstado === e.valor
                  ? "bg-horno-500 text-white"
                  : "bg-white text-corteza-600 hover:bg-masa-100"
              }`}
            >
              {e.etiqueta}
            </Link>
          ))}
        </div>
        <FiltroSucursal
          sucursales={sucursales}
          valorActual={filtroSucursal}
          estadoActual={filtroEstado}
        />
        {esAdmin && (
          <Link
            href="/facturas/costos"
            className="rounded-lg border border-masa-200 bg-white px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
          >
            Evolución de costos
          </Link>
        )}
      </div>

      {/* Lista */}
      {(facturas as FacturaListada[]).length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          No hay facturas {filtroEstado === "TODAS" ? "" : filtroEstado === "PENDIENTE" ? "pendientes" : "pagadas"} en este filtro.
        </section>
      ) : (
        <ul className="space-y-3">
          {(facturas as FacturaListada[]).map((f) => (
            <li key={f.id} className="rounded-panel border border-masa-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-corteza-900">{f.proveedor.nombre}</p>
                    <BadgeEstado estado={f.estado} />
                    {f.estado === "PAGADA" && (
                      <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs text-corteza-400">
                        {f.origenPago === "CAJA_TURNO" ? "Desde caja" : "Por el jefe"}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-corteza-600">
                    {fmtFecha.format(f.fecha)} · {f.sucursal.nombre}
                    {f.numero ? ` · #${f.numero}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-corteza-400">
                    {f.compras.map((c) => `${Number(c.cantidad)} ${c.insumo.unidadMedida} ${c.insumo.nombre}`).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-corteza-400">
                    Registró: {f.registradaPor.nombre}
                    {f.pagadaPor ? ` · Pagó: ${f.pagadaPor.nombre}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="text-lg font-bold text-corteza-900">{dinero(Number(f.montoTotal))}</p>
                    {f.aplicaIva && (
                      <p className="text-xs text-corteza-400">
                        Subtotal {dinero(Number(f.subtotal))} <span className="font-semibold text-horno-600">c/IVA</span>
                      </p>
                    )}
                  </div>

                  {/* Botones por estado y rol */}
                  {f.estado !== "ANULADA" && (
                    <div className="flex flex-wrap gap-2 justify-end">
                      {/* Editar: PENDIENTE → quien registró o ADMIN; PAGADA → solo ADMIN */}
                      {(f.estado === "PENDIENTE"
                        ? (esAdmin || f.registradaPorId === userId)
                        : esAdmin) && (
                        <Link
                          href={`/facturas/${f.id}/editar`}
                          className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                        >
                          Editar
                        </Link>
                      )}

                      {/* Pagar (jefe): PENDIENTE, solo ADMIN */}
                      {esAdmin && f.estado === "PENDIENTE" && (
                        <form action={pagarFacturaJefe}>
                          <input type="hidden" name="facturaId" value={f.id} />
                          <button type="submit" className="rounded-lg bg-cuadre-ok/10 px-3 py-1.5 text-sm font-semibold text-cuadre-ok hover:bg-cuadre-ok/20">
                            Pagar (jefe)
                          </button>
                        </form>
                      )}

                      {/* Revertir pago: PAGADA, solo ADMIN */}
                      {esAdmin && f.estado === "PAGADA" && (
                        <form action={revertirPagoFactura}>
                          <input type="hidden" name="facturaId" value={f.id} />
                          <button type="submit" className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100">
                            Revertir pago
                          </button>
                        </form>
                      )}

                      {/* Anular: PENDIENTE o PAGADA, solo ADMIN */}
                      {esAdmin && (
                        <form action={anularFactura}>
                          <input type="hidden" name="facturaId" value={f.id} />
                          <button type="submit" className="rounded-lg bg-masa-100 px-3 py-1.5 text-sm font-semibold text-corteza-400 hover:bg-masa-200">
                            Anular
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
