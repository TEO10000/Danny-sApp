"use client";

import { useState } from "react";
import DetalleCocheModal from "./DetalleCocheModal";

const CATEGORIAS_LABEL: Record<string, string> = {
  PAN_SAL: "Pan de sal",
  PAN_DULCE: "Pan de dulce",
  PASTELERIA: "Pastelería",
  GALLETERIA: "Galletería",
  EMPAQUETADO: "Empaquetado",
};

type ItemResumen = {
  coche: {
    id: string;
    fecha: Date;
    panaderoId: string;
    notas: string | null;
    sucursal: { id: string; nombre: string };
    panadero: { nombre: string };
    detalles: Array<{
      productoId: string;
      numLatas: number | null;
      panesPorLata: number | null;
      cantidadUnidades: number | null;
      mermas: number;
      producto: { nombre: string; categoria: string };
    }>;
  };
  latas: number;
  panes: number;
  mermas: number;
  ingreso: number | null;
  puedeEditar: boolean;
  turno: "T1" | "T2";
};

function badgeSucursal(nombre: string) {
  // Principal → horno (naranja), cualquier otro → madrugada (azul)
  const esPrincipal = nombre.toLowerCase().includes("principal");
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
        esPrincipal
          ? "bg-horno-500/10 text-horno-600"
          : "bg-madrugada-100 text-madrugada-600"
      }`}
    >
      {nombre}
    </span>
  );
}

function badgeTurno(turno: "T1" | "T2") {
  return (
    <span className="rounded-full border border-masa-200 px-2 py-0.5 text-xs font-semibold text-corteza-500">
      {turno === "T1" ? "T1 · 06-14" : "T2 · 14-22"}
    </span>
  );
}

export default function ListaCoches({ resumen }: { resumen: ItemResumen[] }) {
  const [cocheIdAbierto, setCocheIdAbierto] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("");

  // Categorías disponibles para los tabs
  const categoriasDisponibles = [...new Set(
    resumen.flatMap((r) => r.coche.detalles.map((d) => d.producto.categoria))
  )];

  // Filtrar por categoría
  const filtrados =
    categoriaFiltro === ""
      ? resumen
      : resumen.filter((r) =>
          r.coche.detalles.some((d) => d.producto.categoria === categoriaFiltro)
        );

  // Agrupar por fecha (yyyy-mm-dd en Ecuador)
  const fmtDiaKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" });
  const fmtDiaLabel = new Intl.DateTimeFormat("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Guayaquil",
  });
  const hoyKey = fmtDiaKey.format(new Date());

  const grupos = new Map<string, ItemResumen[]>();
  for (const item of filtrados) {
    const clave = fmtDiaKey.format(item.coche.fecha);
    const lista = grupos.get(clave) ?? [];
    lista.push(item);
    grupos.set(clave, lista);
  }
  const gruposOrdenados = [...grupos.entries()].sort(([a], [b]) => b.localeCompare(a));

  const fmtHora = new Intl.DateTimeFormat("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Guayaquil",
  });

  return (
    <>
      {/* Tabs de categoría */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoriaFiltro("")}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
            categoriaFiltro === ""
              ? "bg-horno-500 text-white"
              : "border border-masa-200 text-corteza-600 hover:bg-masa-100"
          }`}
        >
          Todos
        </button>
        {categoriasDisponibles.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoriaFiltro(cat === categoriaFiltro ? "" : cat)}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
              categoriaFiltro === cat
                ? "bg-horno-500 text-white"
                : "border border-masa-200 text-corteza-600 hover:bg-masa-100"
            }`}
          >
            {CATEGORIAS_LABEL[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Lista agrupada por fecha */}
      <div className="space-y-6">
        {gruposOrdenados.map(([diaKey, items]) => (
          <div key={diaKey}>
            <h3 className="mb-2 text-sm font-bold text-corteza-600">
              {diaKey === hoyKey
                ? `Hoy · ${fmtDiaLabel.format(items[0].coche.fecha)}`
                : fmtDiaLabel.format(items[0].coche.fecha)}
            </h3>
            <ul className="space-y-3">
              {items.map(({ coche, latas, panes, mermas, ingreso, puedeEditar, turno }) => (
                <li
                  key={coche.id}
                  className="cursor-pointer rounded-panel border border-masa-200 bg-white p-4"
                  onClick={() => setCocheIdAbierto(coche.id)}
                >
                  {/* Línea principal */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {badgeSucursal(coche.sucursal.nombre)}
                        {badgeTurno(turno)}
                        <span className="text-sm text-corteza-400">{fmtHora.format(coche.fecha)}</span>
                      </div>
                      <p className="mt-1 font-semibold text-corteza-900">
                        {coche.detalles
                          .map((d) => {
                            const base =
                              d.cantidadUnidades != null
                                ? `${d.cantidadUnidades}u`
                                : `${d.numLatas ?? 0}×${d.panesPorLata ?? 0}`;
                            return `${d.producto.nombre} (${base})`;
                          })
                          .join(" · ")}
                      </p>
                      {/* Línea secundaria */}
                      <p className="mt-0.5 text-sm text-corteza-400">
                        {latas > 0 ? `${latas} latas · ` : ""}
                        {panes} panes
                        {mermas > 0 ? ` · ${mermas} mermas` : ""}
                        {" · "}
                        {coche.panadero.nombre}
                        {coche.notas ? ` · "${coche.notas}"` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {ingreso !== null && (
                        <p className="font-bold text-cuadre-ok">${ingreso.toFixed(2)}</p>
                      )}
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.assign(`/produccion/${coche.id}/editar`);
                          }}
                          className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                        >
                          Editar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.assign(`/produccion/nuevo?duplicarDe=${coche.id}`);
                        }}
                        className="rounded-lg border border-masa-200 px-3 py-1.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
                      >
                        Duplicar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <DetalleCocheModal
        cocheId={cocheIdAbierto}
        onCerrar={() => setCocheIdAbierto(null)}
      />
    </>
  );
}
