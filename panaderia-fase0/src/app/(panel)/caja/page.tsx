import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { etiquetaTurno } from "@/lib/turnos";

export const dynamic = "force-dynamic";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC", // la fecha de cierre es una fecha calendario (sin hora)
});

type CierreListado = {
  id: string;
  fecha: Date;
  tipoTurno: string;
  efectivoContado: unknown;
  efectivoEsperado: unknown;
  descuadre: unknown;
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
        <ul className="space-y-3">
          {cierres.map((c) => {
            const descuadre = Number(c.descuadre);
            const cuadra = Math.abs(descuadre) < 0.005;
            return (
              <li key={c.id} className="rounded-panel border border-masa-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-corteza-900">
                        {fmtFecha.format(c.fecha)} · {c.sucursal.nombre} ·{" "}
                        {etiquetaTurno(c.tipoTurno)}
                      </p>
                      {cierresEditados.has(c.id) && (
                        <span className="rounded-full bg-masa-200 px-2 py-0.5 text-xs font-semibold text-corteza-500">
                          Corregido
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-corteza-600">
                      Ventas ${(Number(c.efectivoEsperado) - 40).toFixed(2)} · contado $
                      {Number(c.efectivoContado).toFixed(2)} (debía haber $
                      {Number(c.efectivoEsperado).toFixed(2)})
                    </p>
                    <p className="mt-1 text-sm text-corteza-400">
                      {c.empleada.nombre}
                      {c.notas ? ` · "${c.notas}"` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className={`font-bold ${cuadra ? "text-cuadre-ok" : "text-cuadre-mal"}`}>
                      {cuadra
                        ? "Cuadra"
                        : `${descuadre < 0 ? "Falta" : "Sobra"} $${Math.abs(descuadre).toFixed(2)}`}
                    </p>
                    {esAdmin && (
                      <Link
                        href={`/caja/${c.id}/editar`}
                        className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                      >
                        Editar
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
