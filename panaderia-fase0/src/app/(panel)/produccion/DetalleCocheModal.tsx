"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import Modal from "@/components/Modal";
import { obtenerDetalleCoche, marcarAgotado } from "./actions";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});
const fmtFechaCorta = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

const CATEGORIAS_CON_VIDA_UTIL = ["PASTELERIA", "GALLETERIA", "EMPAQUETADO"];

type FilaDetalle = {
  detalleId: string;
  productoId: string;
  producto: {
    nombre: string;
    vidaUtilHoras: number | null;
    categoria: string;
  };
  modo: "LATAS" | "UNIDADES";
  numLatas: number | null;
  panesPorLata: number | null;
  cantidadUnidades: number | null;
  mermas: number;
  agotado: boolean;
  agotadoEn: string | null;
  subtotal: number;
  buenos: number;
};

type LogItem = {
  id: string;
  fecha: string;
  usuario: string;
  accion: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
};

type DetalleCoche = {
  id: string;
  fecha: string;
  sucursal: { nombre: string };
  panadero: { nombre: string };
  notas?: string | null;
  detalles: FilaDetalle[];
  latasTotales: number;
  panesTotales: number;
  mermasTotales: number;
  ingresoEstimado?: number;
  puedeEditar: boolean;
  historial: LogItem[];
};

function BadgeVidaUtil({ fila, fechaCoche }: { fila: FilaDetalle; fechaCoche: string }) {
  if (
    fila.producto.vidaUtilHoras == null ||
    !CATEGORIAS_CON_VIDA_UTIL.includes(fila.producto.categoria) ||
    fila.agotado
  ) {
    return null;
  }
  const horasTranscurridas = (Date.now() - new Date(fechaCoche).getTime()) / 3_600_000;
  const porcentaje = horasTranscurridas / fila.producto.vidaUtilHoras;
  if (porcentaje < 0.75) return null;
  if (porcentaje >= 1) {
    return (
      <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-cuadre-mal/10 text-cuadre-mal">
        Vencido
      </span>
    );
  }
  return (
    <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-horno-500/10 text-horno-600">
      Pronto a vencer
    </span>
  );
}

function BotonAgotado({
  fila,
  onCambio,
}: {
  fila: FilaDetalle;
  onCambio: () => void;
}) {
  const [pending, startTransition] = useTransition();
  if (fila.producto.vidaUtilHoras == null || !CATEGORIAS_CON_VIDA_UTIL.includes(fila.producto.categoria)) {
    return null;
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await marcarAgotado(fila.detalleId, !fila.agotado);
          onCambio();
        })
      }
      className={`mt-1 block rounded px-2 py-0.5 text-xs font-semibold disabled:opacity-60 ${
        fila.agotado
          ? "border border-masa-200 text-corteza-500 hover:bg-masa-100"
          : "bg-cuadre-mal/10 text-cuadre-mal hover:bg-cuadre-mal/20"
      }`}
    >
      {pending ? "…" : fila.agotado ? "Restablecer" : "Marcar agotado"}
    </button>
  );
}

export default function DetalleCocheModal({
  cocheId,
  onCerrar,
}: {
  cocheId: string | null;
  onCerrar: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleCoche | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = (id: string) => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerDetalleCoche(id)
      .then((data) => { if (!cancelado) setDetalle(data as DetalleCoche); })
      .catch((err: unknown) => { if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar el coche."); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  };

  useEffect(() => {
    if (!cocheId) { setDetalle(null); setCargando(false); setError(null); return; }
    return cargar(cocheId);
  }, [cocheId]);

  const hayLatas = detalle?.detalles.some((d) => d.modo === "LATAS") ?? false;

  return (
    <Modal abierto={Boolean(cocheId)} onCerrar={onCerrar} titulo="Detalle de coche">
      {cargando && <p className="text-sm text-corteza-600">Cargando…</p>}
      {error && <p className="text-sm text-cuadre-mal">{error}</p>}
      {detalle && (
        <div className="space-y-5 text-sm text-corteza-700">
          {/* Cabecera */}
          <section className="rounded-panel border border-masa-200 bg-masa-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-corteza-900">{fmtFecha.format(new Date(detalle.fecha))}</p>
                <p className="mt-1 text-corteza-600">{detalle.sucursal.nombre}</p>
                <p className="mt-1 text-corteza-600">Panadero: {detalle.panadero.nombre}</p>
              </div>
              <div className="flex gap-2">
                {detalle.puedeEditar && (
                  <Link
                    href={`/produccion/${detalle.id}/editar`}
                    className="text-sm font-semibold text-horno-600 hover:underline"
                  >
                    Editar →
                  </Link>
                )}
                <Link
                  href={`/produccion/nuevo?duplicarDe=${detalle.id}`}
                  className="text-sm font-semibold text-corteza-600 hover:underline"
                >
                  Duplicar →
                </Link>
              </div>
            </div>
            {detalle.notas && <p className="mt-3 text-corteza-500">Nota: {detalle.notas}</p>}
          </section>

          {/* Tabla de detalles */}
          <section>
            <h4 className="mb-2 font-semibold text-corteza-900">Panes</h4>
            <div className="overflow-x-auto rounded-panel border border-masa-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-masa-50 text-corteza-600">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Producción</th>
                    <th className="px-3 py-2">Mermas</th>
                    <th className="px-3 py-2">Buenos</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.detalles.map((fila) => (
                    <tr key={fila.detalleId} className="border-t border-masa-100">
                      <td className="px-3 py-2">
                        <p>
                          {fila.producto.nombre}
                          <BadgeVidaUtil fila={fila} fechaCoche={detalle.fecha} />
                        </p>
                        {fila.agotado && (
                          <p className="text-xs text-corteza-400">
                            Agotado/descartado
                            {fila.agotadoEn
                              ? ` · ${fmtFechaCorta.format(new Date(fila.agotadoEn))}`
                              : ""}
                          </p>
                        )}
                        <BotonAgotado fila={fila} onCambio={() => cargar(detalle.id)} />
                      </td>
                      <td className="px-3 py-2">
                        {fila.modo === "LATAS"
                          ? `${fila.numLatas} latas × ${fila.panesPorLata} = ${fila.subtotal}`
                          : `${fila.cantidadUnidades} unidades`}
                      </td>
                      <td className="px-3 py-2">{fila.mermas}</td>
                      <td className="px-3 py-2">{fila.buenos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Totales */}
          <section className="rounded-panel border border-masa-200 bg-masa-50 p-4">
            <div className={`grid gap-2 ${hayLatas ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {hayLatas && (
                <p><span className="font-semibold">Latas totales:</span> {detalle.latasTotales}</p>
              )}
              <p><span className="font-semibold">Panes totales:</span> {detalle.panesTotales}</p>
              <p><span className="font-semibold">Mermas totales:</span> {detalle.mermasTotales}</p>
            </div>
            {typeof detalle.ingresoEstimado === "number" && (
              <p className="mt-3 font-semibold text-cuadre-ok">
                Ingreso estimado: ${detalle.ingresoEstimado.toFixed(2)}
              </p>
            )}
          </section>

          {/* Historial de cambios */}
          {detalle.historial.length > 0 && (
            <section>
              <h4 className="mb-2 font-semibold text-corteza-900">Historial de cambios</h4>
              <ul className="space-y-2">
                {detalle.historial.map((log) => (
                  <li key={log.id} className="rounded-lg border border-masa-200 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-corteza-800">{log.usuario}</span>
                      <span className="text-xs text-corteza-400">
                        {fmtFechaCorta.format(new Date(log.fecha))}
                      </span>
                    </div>
                    {log.campo && (
                      <p className="mt-0.5 text-xs text-corteza-600">
                        {log.campo}: <span className="line-through">{log.valorAnterior}</span>
                        {" → "}
                        <span className="font-medium">{log.valorNuevo}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
