import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hoyEcuador } from "@/lib/cierres";
import { FiltrosPlan } from "./FiltrosPlan";
import { aprobarPlan, generarPlanManual } from "./actions";

export const dynamic = "force-dynamic";

type ProductoPlan = {
  nombre: string;
  latasSugeridas: number;
  panesPorLata: number;
  totalUnidades: number;
  nota?: string;
};

type DiaPlan = {
  fecha: string;
  diaSemana: string;
  productos: ProductoPlan[];
};

type ContenidoPlan = {
  semana: string;
  sucursal: string;
  patronesDetectados: string[];
  dias: DiaPlan[];
};

type PlanFila = {
  id: string;
  semanaInicio: Date;
  sucursalId: string;
  estado: string;
  generadoPorIa: boolean;
  contenidoJson: unknown;
  aprobadoPor: { nombre: string } | null;
  createdAt: Date;
};

/** Devuelve el lunes de la semana actual en hora Ecuador */
function lunesActual(): string {
  const hoy = hoyEcuador(); // "YYYY-MM-DD"
  const d = new Date(hoy + "T12:00:00Z");
  const diaSem = d.getUTCDay(); // 0=dom, 1=lun
  const diff = diaSem === 0 ? -6 : 1 - diaSem;
  const lunes = new Date(d.getTime() + diff * 24 * 60 * 60 * 1000);
  return lunes.toISOString().slice(0, 10);
}

/** Genera un rango de lunes: últimas 4 semanas + próximas 2 */
function rangoDeSemanas(): string[] {
  const lunes = lunesActual();
  const d = new Date(lunes + "T12:00:00Z");
  const semanas: string[] = [];
  for (let i = -4; i <= 2; i++) {
    const s = new Date(d.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    semanas.push(s.toISOString().slice(0, 10));
  }
  return semanas;
}

const fmtFechaCorta = new Intl.DateTimeFormat("es-EC", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const fmtFechaLarga = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

export default async function PlanSemanalPage({
  searchParams,
}: {
  searchParams: { sucursal?: string; semana?: string };
}) {
  const session = await auth();
  const rol = session?.user?.rol;
  if (rol !== "ADMIN" && rol !== "PANADERO") {
    redirect("/");
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
  });

  const sucursalId = searchParams.sucursal ?? sucursales[0]?.id ?? "";
  const semanaActual = searchParams.semana ?? lunesActual();

  // Semanas disponibles: unión del rango fijo + semanas que tienen plan en DB
  const planesExistentes = await prisma.planSemanal.findMany({
    where: { sucursalId },
    select: { semanaInicio: true },
    orderBy: { semanaInicio: "desc" },
  });

  const semanasDB = planesExistentes.map((p) => p.semanaInicio.toISOString().slice(0, 10));
  const semanasRango = rangoDeSemanas();
  const todasSemanas = [...new Set([...semanasDB, ...semanasRango])].sort((a, b) =>
    b.localeCompare(a)
  );

  const semanaDate = new Date(semanaActual + "T00:00:00.000Z");

  const plan = (await prisma.planSemanal.findUnique({
    where: { semanaInicio_sucursalId: { semanaInicio: semanaDate, sucursalId } },
    include: { aprobadoPor: { select: { nombre: true } } },
  })) as PlanFila | null;

  const contenido = plan ? (plan.contenidoJson as ContenidoPlan) : null;
  const esAdmin = rol === "ADMIN";

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-corteza-900">Plan Semanal</h2>

      {/* Filtros */}
      <div className="rounded-panel border border-masa-200 bg-white p-4">
        <FiltrosPlan
          sucursales={sucursales}
          sucursalActual={sucursalId}
          semanaActual={semanaActual}
          semanasDisponibles={todasSemanas}
        />
      </div>

      {/* Sin plan */}
      {!plan && (
        <div className="rounded-panel border border-masa-200 bg-white p-6 text-center space-y-3">
          <p className="text-corteza-600">
            No hay plan generado para esta semana.
          </p>
          <p className="text-sm text-corteza-400">
            El plan se genera automáticamente cada domingo. Si eres administrador, puedes generarlo manualmente.
          </p>
          {esAdmin && (
            <form
              action={async () => {
                "use server";
                await generarPlanManual(sucursalId, semanaActual);
              }}
            >
              <button
                type="submit"
                className="rounded-lg bg-horno-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-horno-600"
              >
                Generar ahora
              </button>
            </form>
          )}
        </div>
      )}

      {/* Plan existente */}
      {plan && contenido && (
        <div className="space-y-4">
          {/* Estado + acciones */}
          <div className="rounded-panel border border-masa-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    plan.estado === "APROBADO"
                      ? "bg-cuadre-ok/10 text-cuadre-ok"
                      : "bg-horno-500/10 text-horno-700"
                  }`}
                >
                  {plan.estado === "APROBADO" ? "Aprobado" : "Borrador"}
                </span>
                {plan.estado === "APROBADO" && plan.aprobadoPor && (
                  <span className="text-xs text-corteza-500">
                    por {plan.aprobadoPor.nombre} · {fmtFechaLarga.format(plan.createdAt)}
                  </span>
                )}
              </div>
            </div>

            {esAdmin && plan.estado !== "APROBADO" && (
              <div className="flex gap-2 flex-wrap">
                <form
                  action={async () => {
                    "use server";
                    await aprobarPlan(plan.id);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg bg-cuadre-ok px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  >
                    Aprobar plan
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await generarPlanManual(sucursalId, semanaActual);
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg border border-masa-200 px-4 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                  >
                    Regenerar
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Patrones detectados */}
          {contenido.patronesDetectados?.length > 0 && (
            <div className="rounded-panel border border-masa-200 bg-masa-50 p-4">
              <p className="text-sm font-semibold text-corteza-700 mb-2">Patrones detectados</p>
              <ul className="space-y-1">
                {contenido.patronesDetectados.map((p, i) => (
                  <li key={i} className="text-sm text-corteza-600 flex gap-2">
                    <span>•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Días */}
          {contenido.dias?.map((dia) => {
            const totalDia = dia.productos.reduce((s, p) => s + (p.totalUnidades ?? 0), 0);
            return (
              <section
                key={dia.fecha}
                className="rounded-panel border border-masa-200 bg-white p-4 space-y-3"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold text-corteza-900 capitalize">
                    {fmtFechaCorta.format(new Date(dia.fecha + "T12:00:00Z"))}
                  </h3>
                  <span className="text-sm text-corteza-500">
                    {totalDia.toLocaleString("es-EC")} unidades totales
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-masa-200 text-left text-xs text-corteza-400">
                        <th className="pb-2 font-semibold">Producto</th>
                        <th className="pb-2 font-semibold text-right">Latas</th>
                        <th className="pb-2 font-semibold text-right">Panes/lata</th>
                        <th className="pb-2 font-semibold text-right">Total</th>
                        <th className="pb-2 font-semibold">Nota</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-masa-100">
                      {dia.productos.map((prod, idx) => (
                        <tr key={idx}>
                          <td className="py-2 text-corteza-700">{prod.nombre}</td>
                          <td className="py-2 text-right text-corteza-900">{prod.latasSugeridas}</td>
                          <td className="py-2 text-right text-corteza-900">{prod.panesPorLata}</td>
                          <td className="py-2 text-right font-semibold text-corteza-900">
                            {prod.totalUnidades.toLocaleString("es-EC")}
                          </td>
                          <td className="py-2 text-corteza-400 text-xs">{prod.nota ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <p className="text-xs text-corteza-400 italic">
            Este plan es una sugerencia de la IA basada en el historial. El panadero puede ajustarlo según su criterio.
          </p>
        </div>
      )}
    </div>
  );
}
