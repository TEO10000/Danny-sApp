"use client";

import Link from "next/link";

type Fila = {
  id: string;
  monto: number;
  referencia: string | null;
  remitente: string | null;
  beneficiario: string | null;
  sucursal: string;
  empleada: string | null;
  estado: string;
  origen: string;
  cierreTurnoId: string | null;
  createdAt: string;
  hora: string | null;
};

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

const fmtHora = new Intl.DateTimeFormat("es-EC", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
  hour12: false,
});

function chipEstado(estado: string) {
  if (estado === "CONFIRMADA")
    return <span className="rounded-full bg-cuadre-ok/15 px-2 py-0.5 text-xs font-semibold text-cuadre-ok">Confirmada</span>;
  if (estado === "DESCARTADA")
    return <span className="rounded-full bg-masa-200 px-2 py-0.5 text-xs text-corteza-400">Descartada</span>;
  return <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-700">Sugerida</span>;
}

function chipOrigen(origen: string) {
  if (origen === "QR")
    return <span className="rounded-full bg-horno-50 px-2 py-0.5 text-xs text-horno-600">QR</span>;
  if (origen === "CORREO")
    return <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs text-corteza-500">correo</span>;
  return <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs text-corteza-500">manual</span>;
}

// Agrupa por día (fecha de Ecuador)
function agruparPorDia(filas: Fila[]): Map<string, Fila[]> {
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const dia = fmtFecha.format(new Date(f.createdAt));
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia)!.push(f);
  }
  return grupos;
}

export function ListaTransferencias({
  filas,
  esAdmin,
}: {
  filas: Fila[];
  esAdmin: boolean;
}) {
  if (filas.length === 0) {
    return (
      <div className="rounded-panel border border-masa-200 bg-white p-8 text-center text-sm text-corteza-400">
        Aún no hay transferencias registradas.
      </div>
    );
  }

  const grupos = agruparPorDia(filas);

  return (
    <div className="space-y-4">
      {Array.from(grupos.entries()).map(([dia, items]) => (
        <section key={dia} className="overflow-hidden rounded-panel border border-masa-200 bg-white">
          <div className="border-b border-masa-200 bg-masa-50 px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-corteza-500">{dia}</p>
          </div>
          <ul className="divide-y divide-masa-100">
            {items.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold text-corteza-900">
                        ${t.monto.toFixed(2)}
                      </span>
                      <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs font-semibold text-corteza-600">
                        {t.sucursal}
                      </span>
                      {chipOrigen(t.origen)}
                      {chipEstado(t.estado)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-corteza-400">
                      {t.hora && <span>{fmtHora.format(new Date(t.hora))}</span>}
                      {t.referencia && <span>#{t.referencia}</span>}
                      {t.remitente && <span>De: {t.remitente}</span>}
                      {esAdmin && t.empleada && <span>Por: {t.empleada}</span>}
                    </div>
                  </div>
                  {t.cierreTurnoId && (
                    <Link
                      href={`/caja/${t.cierreTurnoId}`}
                      className="shrink-0 rounded-lg border border-masa-200 px-2.5 py-1.5 text-xs font-semibold text-corteza-600 hover:bg-masa-100"
                    >
                      Ver cierre
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
