import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { datosParaCierre, etiquetaTurno, strDeFechaDia, type TipoTurno } from "@/lib/turnos";
import { FormEditarCierre } from "./FormEditarCierre";

export const dynamic = "force-dynamic";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export default async function EditarCierrePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") redirect("/caja");

  const cierre = await prisma.cierreTurno.findUnique({
    where: { id: params.id },
    include: {
      sobrantes: { select: { productoId: true, cantidadSobrante: true } },
      sucursal: { select: { nombre: true } },
      transferencias: {
        orderBy: { hora: "asc" },
        select: { id: true, monto: true, referencia: true, remitente: true, hora: true, estado: true, origen: true },
      },
    },
  });
  if (!cierre) notFound();

  const fechaStr = strDeFechaDia(cierre.fecha);
  const tipo = cierre.tipoTurno as TipoTurno;
  const datos = await datosParaCierre(cierre.sucursalId, fechaStr, tipo);

  const sobranteActualPor = new Map(
    cierre.sobrantes.map((s) => [s.productoId, s.cantidadSobrante])
  );

  const filas = datos.filas.map((f) => ({
    ...f,
    sobranteActual: sobranteActualPor.get(f.productoId) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/caja"
          className="text-sm font-semibold text-horno-600 hover:underline"
        >
          ← Volver a Caja
        </Link>
        <h2 className="mt-2 text-xl font-bold text-corteza-900">
          Editar cierre — {fmtFecha.format(cierre.fecha)}
        </h2>
        <p className="mt-1 text-sm text-corteza-600">
          {cierre.sucursal.nombre} · {etiquetaTurno(tipo)}
        </p>
      </div>

      <FormEditarCierre
        cierreId={cierre.id}
        filas={filas}
        efectivoContadoInicial={Number(cierre.efectivoContado)}
        notasInicial={cierre.notas ?? ""}
        totalTransferenciasActual={Number(cierre.totalTransferencias)}
        transferencias={cierre.transferencias.map((t) => ({
          id: t.id,
          monto: Number(t.monto),
          referencia: t.referencia,
          remitente: t.remitente,
          hora: t.hora?.toISOString() ?? null,
          estado: t.estado as "CONFIRMADA" | "DESCARTADA",
          origen: t.origen as "CORREO" | "MANUAL",
        }))}
      />
    </div>
  );
}
