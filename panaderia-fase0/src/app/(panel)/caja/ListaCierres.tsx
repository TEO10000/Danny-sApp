"use client";

import { useState } from "react";
import { etiquetaTurno } from "@/lib/turnos";
import DetalleCierreModal from "./DetalleCierreModal";

export default function ListaCierres({
  cierres,
  cierresEditados,
  esAdmin,
  children,
}: {
  cierres: Array<{
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
  }>;
  cierresEditados: Set<string>;
  esAdmin: boolean;
  children?: React.ReactNode;
}) {
  const [cierreIdAbierto, setCierreIdAbierto] = useState<string | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {cierres.map((c) => {
          const descuadre = Number(c.descuadre);
          const cuadra = Math.abs(descuadre) < 0.005;
          return (
            <li
              key={c.id}
              className="cursor-pointer rounded-panel border border-masa-200 bg-white p-4"
              onClick={() => setCierreIdAbierto(c.id)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-corteza-900">
                      {new Intl.DateTimeFormat("es-EC", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      }).format(c.fecha)} · {c.sucursal.nombre} · {etiquetaTurno(c.tipoTurno)}
                    </p>
                    {cierresEditados.has(c.id) && (
                      <span className="rounded-full bg-masa-200 px-2 py-0.5 text-xs font-semibold text-corteza-500">
                        Corregido
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-corteza-600">
                    Ventas ${(Number(c.efectivoEsperado) - 40 + Number(c.totalTransferencias)).toFixed(2)}
                    {Number(c.totalTransferencias) > 0
                      ? ` · Efectivo $${(Number(c.efectivoEsperado) - 40).toFixed(2)} · Transf. $${Number(c.totalTransferencias).toFixed(2)}`
                      : ""}
                    {" "}· contado ${Number(c.efectivoContado).toFixed(2)} (debía ${Number(c.efectivoEsperado).toFixed(2)})
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
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.location.assign(`/caja/${c.id}/editar`);
                      }}
                      className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <DetalleCierreModal cierreId={cierreIdAbierto} onCerrar={() => setCierreIdAbierto(null)} />
    </>
  );
}
