"use client";

import { useState } from "react";
import DetalleCocheModal from "./DetalleCocheModal";

export default function ListaCoches({
  resumen,
}: {
  resumen: Array<{
    coche: {
      id: string;
      fecha: Date;
      panaderoId: string;
      notas: string | null;
      sucursal: { nombre: string };
      panadero: { nombre: string };
      detalles: Array<{
        productoId: string;
        numLatas: number | null;
        panesPorLata: number | null;
        cantidadUnidades: number | null;
        mermas: number;
        producto: { nombre: string };
      }>;
    };
    latas: number;
    panes: number;
    mermas: number;
    ingreso: number | null;
    puedeEditar: boolean;
  }>;
}) {
  const [cocheIdAbierto, setCocheIdAbierto] = useState<string | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {resumen.map(({ coche, latas, panes, mermas, ingreso, puedeEditar }) => (
          <li
            key={coche.id}
            className="cursor-pointer rounded-panel border border-masa-200 bg-white p-4"
            onClick={() => setCocheIdAbierto(coche.id)}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-corteza-900">
                  {new Intl.DateTimeFormat("es-EC", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Guayaquil",
                  }).format(coche.fecha)} · {coche.sucursal.nombre}
                </p>
                <p className="mt-1 text-sm text-corteza-600">
                  {coche.detalles
                    .map((d) => {
                      const base = d.cantidadUnidades != null ? `${d.cantidadUnidades}u` : `${d.numLatas ?? 0}×${d.panesPorLata ?? 0}`;
                      return `${d.producto.nombre} (${base})`;
                    })
                    .join(" · ")}
                </p>
                <p className="mt-1 text-sm text-corteza-400">
                  {latas} latas · {panes} panes
                  {mermas > 0 ? ` · ${mermas} mermas` : ""} · {coche.panadero.nombre}
                  {coche.notas ? ` · "${coche.notas}"` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {ingreso !== null && <p className="font-bold text-cuadre-ok">${ingreso.toFixed(2)} est.</p>}
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      window.location.assign(`/produccion/${coche.id}/editar`);
                    }}
                    className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <DetalleCocheModal cocheId={cocheIdAbierto} onCerrar={() => setCocheIdAbierto(null)} />
    </>
  );
}
