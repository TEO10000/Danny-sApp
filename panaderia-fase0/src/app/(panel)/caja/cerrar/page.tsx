import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { datosParaCierre, TURNOS, etiquetaTurno, type TipoTurno } from "@/lib/turnos";
import { CierreForm } from "../CierreForm";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

function ahoraEcuador() {
  const ahora = new Date();
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(ahora);
  const hora = parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Guayaquil",
      hour: "2-digit",
      hour12: false,
    }).format(ahora),
    10
  );
  return { fecha, turnoSugerido: (hora < 14 ? "T1_06_14" : "T2_14_22") as TipoTurno };
}

export default async function CerrarTurnoPage({
  searchParams,
}: {
  searchParams: { sucursal?: string; fecha?: string; turno?: string };
}) {
  const sucursales = (await prisma.sucursal.findMany({
    orderBy: { nombre: "asc" },
  })) as Array<{ id: string; nombre: string }>;
  const { fecha: hoy, turnoSugerido } = ahoraEcuador();

  const sucursalId = searchParams.sucursal ?? "";
  const fecha = searchParams.fecha ?? "";
  const turno = searchParams.turno ?? "";
  const listo =
    sucursales.some((s) => s.id === sucursalId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
    (turno === "T1_06_14" || turno === "T2_14_22");

  // Paso 1: elegir sucursal, fecha y turno (RF-09.3: la empleada elige dónde trabajó)
  if (!listo) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Cerrar turno</h2>
          <p className="mt-1 text-sm text-corteza-600">
            ¿Dónde trabajaste y qué turno terminas?
          </p>
        </div>
        <form method="get" className="grid gap-4 rounded-panel border border-masa-200 bg-white p-5 sm:grid-cols-3">
          <div>
            <label htmlFor="sucursal" className="block text-sm font-semibold text-corteza-800">
              Sucursal
            </label>
            <select id="sucursal" name="sucursal" required className={`mt-1.5 ${inputCls}`}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fecha" className="block text-sm font-semibold text-corteza-800">
              Fecha
            </label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              required
              defaultValue={hoy}
              className={`mt-1.5 ${inputCls}`}
            />
          </div>
          <div>
            <label htmlFor="turno" className="block text-sm font-semibold text-corteza-800">
              Turno
            </label>
            <select
              id="turno"
              name="turno"
              required
              defaultValue={turnoSugerido}
              className={`mt-1.5 ${inputCls}`}
            >
              {TURNOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="w-full rounded-lg bg-horno-500 px-4 py-3.5 text-touch-lg text-white hover:bg-horno-600 sm:w-auto"
            >
              Continuar
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Paso 2: tabla de sobrantes con todo precargado
  const [datos, facturasCrudas] = await Promise.all([
    datosParaCierre(sucursalId, fecha, turno as TipoTurno),
    prisma.facturaProveedor.findMany({
      where: { sucursalId, estado: "PENDIENTE" },
      select: {
        id: true,
        numero: true,
        montoTotal: true,
        proveedor: { select: { nombre: true } },
      },
      orderBy: { fecha: "asc" },
    }),
  ]);

  const facturasPendientes = (
    facturasCrudas as Array<{
      id: string;
      numero: string | null;
      montoTotal: unknown;
      proveedor: { nombre: string };
    }>
  ).map((f) => ({
    id: f.id,
    numero: f.numero,
    montoTotal: Number(f.montoTotal),
    proveedor: f.proveedor,
  }));

  const sucursalNombre = sucursales.find((s) => s.id === sucursalId)?.nombre ?? "";

  if (datos.yaCerrado) {
    return (
      <section className="rounded-panel border border-masa-200 bg-white p-6">
        <h2 className="text-xl font-bold text-corteza-900">Turno ya cerrado</h2>
        <p className="mt-2 text-corteza-600">
          El {etiquetaTurno(turno)} del {fecha} en {sucursalNombre} ya tiene su
          cierre registrado. Si hubo un error, avisa al administrador.
        </p>
        <Link
          href="/caja"
          className="mt-4 inline-block rounded-lg border border-masa-200 px-4 py-2.5 font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Volver a Caja
        </Link>
      </section>
    );
  }

  if (datos.filas.length === 0) {
    return (
      <section className="rounded-panel border border-masa-200 bg-white p-6">
        <h2 className="text-xl font-bold text-corteza-900">Sin productos</h2>
        <p className="mt-2 text-corteza-600">
          No hay productos activos en el catálogo para contar sobrantes. Pide al
          administrador que los agregue en Catálogo.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-corteza-900">
          Cerrar {etiquetaTurno(turno)}
        </h2>
        <p className="mt-1 text-sm text-corteza-600">
          {sucursalNombre} · {fecha} ·{" "}
          <Link href="/caja/cerrar" className="font-semibold text-horno-600 underline">
            cambiar
          </Link>
        </p>
        <p className="mt-2 text-sm text-corteza-600">
          Cuenta lo que quedó en vitrina de cada producto. Lo vendido se calcula
          solo: disponible − sobrante.
        </p>
      </div>
      <CierreForm
        sucursalId={sucursalId}
        fecha={fecha}
        tipoTurno={turno}
        filas={datos.filas}
        facturasPendientes={facturasPendientes}
      />
    </div>
  );
}
