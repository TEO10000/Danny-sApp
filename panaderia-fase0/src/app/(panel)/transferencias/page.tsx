import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EscanerQR } from "./EscanerQR";
import { ListaTransferencias } from "./ListaTransferencias";

export const dynamic = "force-dynamic";

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: { sucursal?: string; fecha?: string; empleada?: string };
}) {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  const rol = sesion.user.rol ?? "";
  const userId = sesion.user.id ?? "";
  const esAdmin = rol === "ADMIN";

  const [sucursales, transferencias] = await Promise.all([
    prisma.sucursal.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
    esAdmin
      ? // ADMIN: todas, con filtros opcionales
        prisma.transferenciaTurno.findMany({
          where: {
            ...(searchParams.sucursal ? { sucursalId: searchParams.sucursal } : {}),
            ...(searchParams.fecha
              ? {
                  createdAt: {
                    gte: new Date(`${searchParams.fecha}T00:00:00-05:00`),
                    lt: new Date(`${searchParams.fecha}T24:00:00-05:00`),
                  },
                }
              : {}),
            ...(searchParams.empleada ? { registradaPorId: searchParams.empleada } : {}),
          },
          include: {
            sucursal: { select: { nombre: true } },
            registradaPor: { select: { nombre: true } },
            cierreTurno: { select: { id: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : // ATENCION_CLIENTE: solo las suyas
        prisma.transferenciaTurno.findMany({
          where: { registradaPorId: userId },
          include: {
            sucursal: { select: { nombre: true } },
            registradaPor: { select: { nombre: true } },
            cierreTurno: { select: { id: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
  ]);

  // Para el ADMIN: lista de empleadas que han escaneado
  const empleadas = esAdmin
    ? await prisma.user.findMany({
        where: {
          rol: "ATENCION_CLIENTE",
          transferenciasRegistradas: { some: {} },
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      })
    : [];

  const filas = transferencias.map((t) => ({
    id: t.id,
    monto: Number(t.monto),
    referencia: t.referencia,
    remitente: t.remitente,
    beneficiario: t.beneficiario,
    sucursal: t.sucursal.nombre,
    empleada: t.registradaPor?.nombre ?? null,
    estado: t.estado,
    origen: t.origen,
    cierreTurnoId: t.cierreTurno?.id ?? null,
    createdAt: t.createdAt.toISOString(),
    hora: t.hora?.toISOString() ?? null,
  }));

  // Última sucursal usada por esta empleada (para preseleccionar)
  let sucursalDefaultId: string | undefined;
  if (!esAdmin && transferencias.length > 0) {
    sucursalDefaultId = transferencias[0].sucursalId;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-corteza-900">Transferencias</h2>
        <p className="mt-1 text-sm text-corteza-600">
          {esAdmin
            ? "Todas las transferencias registradas."
            : "Tus transferencias registradas. Escanea el QR del comprobante para registrar una nueva."}
        </p>
      </div>

      {/* Filtros ADMIN */}
      {esAdmin && (
        <form method="get" className="flex flex-wrap gap-3 rounded-panel border border-masa-200 bg-white p-4">
          <select
            name="sucursal"
            defaultValue={searchParams.sucursal ?? ""}
            className="rounded-lg border border-masa-200 bg-masa-50 px-3 py-2 text-sm outline-none focus:border-horno-500"
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <input
            type="date"
            name="fecha"
            defaultValue={searchParams.fecha ?? ""}
            className="rounded-lg border border-masa-200 bg-masa-50 px-3 py-2 text-sm outline-none focus:border-horno-500"
          />
          {empleadas.length > 0 && (
            <select
              name="empleada"
              defaultValue={searchParams.empleada ?? ""}
              className="rounded-lg border border-masa-200 bg-masa-50 px-3 py-2 text-sm outline-none focus:border-horno-500"
            >
              <option value="">Todas las empleadas</option>
              {empleadas.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="rounded-lg bg-horno-500 px-4 py-2 text-sm font-semibold text-white hover:bg-horno-600"
          >
            Filtrar
          </button>
          {(searchParams.sucursal || searchParams.fecha || searchParams.empleada) && (
            <a
              href="/transferencias"
              className="rounded-lg border border-masa-200 px-4 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
            >
              Limpiar
            </a>
          )}
        </form>
      )}

      {/* Lista */}
      <ListaTransferencias filas={filas} esAdmin={esAdmin} />

      {/* Espaciado para el botón fijo inferior */}
      <div className="h-24" />

      {/* Botón de escaneo fijo al fondo — grande, al alcance del pulgar */}
      <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 w-full max-w-xs px-4">
        <EscanerQR sucursales={sucursales} sucursalDefaultId={sucursalDefaultId} />
      </div>
    </div>
  );
}
