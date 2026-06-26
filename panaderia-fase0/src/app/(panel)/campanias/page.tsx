import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dinero } from "@/lib/catalogo";
import { hoyEcuador } from "@/lib/cierres";

export const dynamic = "force-dynamic";

type CampaniaFila = {
  id: string;
  nombre: string;
  descripcion: string | null;
  fechaInicio: Date;
  fechaFin: Date;
  costo: unknown;
  sucursalId: string | null;
  productos: Array<{ producto: { nombre: string } }>;
};

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

function estadoCampania(hoy: string, inicio: Date, fin: Date): string {
  const inicioStr = inicio.toISOString().slice(0, 10);
  const finStr = fin.toISOString().slice(0, 10);
  if (hoy < inicioStr) return "Próxima";
  if (hoy > finStr) return "Finalizada";
  return "Activa";
}

const BADGE: Record<string, string> = {
  Activa: "bg-cuadre-ok/10 text-cuadre-ok",
  Próxima: "bg-horno-500/10 text-horno-700",
  Finalizada: "bg-masa-200 text-corteza-500",
};

export default async function CampaniasPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    redirect("/campanias?error=permiso");
  }

  const [campanias, sucursales] = await Promise.all([
    prisma.campania.findMany({
      orderBy: { fechaInicio: "desc" },
      include: {
        productos: { include: { producto: { select: { nombre: true } } } },
      },
    }),
    prisma.sucursal.findMany({ select: { id: true, nombre: true } }),
  ]);

  const mapaSucursales = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const hoy = hoyEcuador();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-corteza-900">Campañas</h2>
        <Link
          href="/campanias/nueva"
          className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600"
        >
          Nueva campaña
        </Link>
      </div>

      {searchParams.error === "permiso" && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          Solo los administradores pueden gestionar campañas.
        </p>
      )}

      {(campanias as CampaniaFila[]).length === 0 ? (
        <div className="rounded-panel border border-masa-200 bg-white p-8 text-center">
          <p className="text-corteza-500">Aún no hay campañas registradas.</p>
          <p className="mt-1 text-sm text-corteza-400">
            Crea tu primera campaña con el botón de arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(campanias as CampaniaFila[]).map((c) => {
            const estado = estadoCampania(hoy, c.fechaInicio, c.fechaFin);
            return (
              <div
                key={c.id}
                className="rounded-panel border border-masa-200 bg-white p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-corteza-900">{c.nombre}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[estado]}`}
                      >
                        {estado}
                      </span>
                    </div>
                    {c.descripcion && (
                      <p className="mt-0.5 text-sm text-corteza-500">{c.descripcion}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/campanias/${c.id}`}
                      className="rounded-lg border border-masa-200 px-3 py-1.5 text-xs font-semibold text-corteza-600 hover:bg-masa-100"
                    >
                      Ver métricas
                    </Link>
                    <Link
                      href={`/campanias/${c.id}/editar`}
                      className="rounded-lg border border-masa-200 px-3 py-1.5 text-xs font-semibold text-corteza-600 hover:bg-masa-100"
                    >
                      Editar
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <span className="text-xs text-corteza-400">Inicio</span>
                    <p className="font-medium text-corteza-700">{fmtFecha.format(c.fechaInicio)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-corteza-400">Fin</span>
                    <p className="font-medium text-corteza-700">{fmtFecha.format(c.fechaFin)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-corteza-400">Sucursal</span>
                    <p className="font-medium text-corteza-700">
                      {c.sucursalId ? (mapaSucursales.get(c.sucursalId) ?? "—") : "Ambas sucursales"}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-corteza-400">Costo</span>
                    <p className="font-medium text-corteza-700">{dinero(Number(c.costo))}</p>
                  </div>
                </div>

                {c.productos.length > 0 && (
                  <div>
                    <p className="text-xs text-corteza-400 mb-1">Productos</p>
                    <div className="flex flex-wrap gap-1">
                      {c.productos.map((cp) => (
                        <span
                          key={cp.producto.nombre}
                          className="rounded-full bg-masa-100 px-2 py-0.5 text-xs text-corteza-600"
                        >
                          {cp.producto.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
