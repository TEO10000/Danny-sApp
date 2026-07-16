import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ListaCierres from "./ListaCierres";

export const dynamic = "force-dynamic";

type CierreListado = {
  id: string;
  fecha: Date;
  tipoTurno: string;
  efectivoContado: unknown;
  efectivoEsperado: unknown;
  descuadre: unknown;
  totalTransferencias: unknown;
  notas: string | null;
  sucursal: { nombre: string };
  empleada: { nombre: string };
};

export default async function CajaPage({
  searchParams,
}: {
  searchParams: { guardado?: string; editado?: string; eliminado?: string };
}) {
  const session = await auth();
  const esAdmin = session?.user?.rol === "ADMIN";

  const cierres = (await prisma.cierreTurno.findMany({
    orderBy: [{ fecha: "desc" }, { tipoTurno: "desc" }],
    take: 30,
    include: {
      sucursal: { select: { nombre: true } },
      empleada: { select: { nombre: true } },
    },
  })) as CierreListado[];

  // Cierres que fueron editados (tienen AuditLog con accion EDITAR)
  const cierresEditados = esAdmin
    ? new Set(
        (
          await prisma.auditLog.findMany({
            where: {
              entidad: "CierreTurno",
              accion: "EDITAR",
              entidadId: { in: cierres.map((c) => c.id) },
            },
            select: { entidadId: true },
            distinct: ["entidadId"],
          })
        ).map((a) => a.entidadId)
      )
    : new Set<string>();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Caja</h2>
          <p className="mt-1 text-sm text-corteza-600">
            Cierres de turno: sobrantes, ventas y cuadre del fondo de $40.
          </p>
        </div>
        <Link
          href="/caja/cerrar"
          className="rounded-lg bg-horno-500 px-4 py-3 text-touch-lg text-white hover:bg-horno-600"
        >
          Cerrar turno
        </Link>
      </div>

      {searchParams.guardado && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Turno cerrado y ventas calculadas.
        </p>
      )}
      {searchParams.editado && (
        <p role="status" className="rounded-lg bg-cuadre-ok/10 px-3 py-2 text-sm font-medium text-cuadre-ok">
          Cierre actualizado y ventas recalculadas.
        </p>
      )}
      {searchParams.eliminado && (
        <p role="status" className="rounded-lg bg-masa-200 px-3 py-2 text-sm font-medium text-corteza-600">
          Cierre eliminado. Las facturas de caja volvieron a Pendiente.
        </p>
      )}

      {cierres.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          Aún no hay cierres. Al terminar el turno, usa el botón de arriba:
          eliges sucursal y turno, cuentas los sobrantes y el efectivo, y el
          sistema calcula las ventas y el cuadre.
        </section>
      ) : (
        <ListaCierres cierres={cierres} cierresEditados={cierresEditados} esAdmin={esAdmin} />
      )}
    </div>
  );
}
