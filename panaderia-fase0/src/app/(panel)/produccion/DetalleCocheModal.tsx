"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { obtenerDetalleCoche } from "./actions";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

type DetalleCoche = {
  id: string;
  fecha: string;
  sucursal: { nombre: string };
  panadero: { nombre: string };
  notas?: string | null;
  detalles: Array<{
    productoId: string;
    producto: { nombre: string };
    numLatas: number;
    panesPorLata: number;
    mermas: number;
    subtotal: number;
    buenos: number;
  }>;
  latasTotales: number;
  panesTotales: number;
  mermasTotales: number;
  ingresoEstimado?: number;
  puedeEditar: boolean;
};

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

  useEffect(() => {
    if (!cocheId) {
      setDetalle(null);
      setCargando(false);
      setError(null);
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerDetalleCoche(cocheId)
      .then((data) => {
        if (!cancelado) setDetalle(data as DetalleCoche);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar el coche.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [cocheId]);

  return (
    <Modal abierto={Boolean(cocheId)} onCerrar={onCerrar} titulo="Detalle de coche">
      {cargando && <p className="text-sm text-corteza-600">Cargando…</p>}
      {error && <p className="text-sm text-cuadre-mal">{error}</p>}
      {detalle && (
        <div className="space-y-5 text-sm text-corteza-700">
          <section className="rounded-panel border border-masa-200 bg-masa-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-corteza-900">{fmtFecha.format(new Date(detalle.fecha))}</p>
                <p className="mt-1 text-corteza-600">{detalle.sucursal.nombre}</p>
                <p className="mt-1 text-corteza-600">Panadero: {detalle.panadero.nombre}</p>
              </div>
              {detalle.puedeEditar && (
                <Link href={`/produccion/${detalle.id}/editar`} className="text-sm font-semibold text-horno-600 hover:underline">
                  Editar este coche →
                </Link>
              )}
            </div>
            {detalle.notas && <p className="mt-3 text-corteza-500">Nota: {detalle.notas}</p>}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-corteza-900">Detalle de panes</h4>
            <div className="overflow-x-auto rounded-panel border border-masa-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-masa-50 text-corteza-600">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Latas</th>
                    <th className="px-3 py-2">Panes/lata</th>
                    <th className="px-3 py-2">Subtotal</th>
                    <th className="px-3 py-2">Mermas</th>
                    <th className="px-3 py-2">Buenos</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.detalles.map((fila) => (
                    <tr key={fila.productoId} className="border-t border-masa-100">
                      <td className="px-3 py-2">{fila.producto.nombre}</td>
                      <td className="px-3 py-2">{fila.numLatas}</td>
                      <td className="px-3 py-2">{fila.panesPorLata}</td>
                      <td className="px-3 py-2">{fila.subtotal}</td>
                      <td className="px-3 py-2">{fila.mermas}</td>
                      <td className="px-3 py-2">{fila.buenos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-panel border border-masa-200 bg-masa-50 p-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <p><span className="font-semibold">Latas totales:</span> {detalle.latasTotales}</p>
              <p><span className="font-semibold">Panes totales:</span> {detalle.panesTotales}</p>
              <p><span className="font-semibold">Mermas totales:</span> {detalle.mermasTotales}</p>
            </div>
            {typeof detalle.ingresoEstimado === "number" && (
              <p className="mt-3 font-semibold text-cuadre-ok">
                Ingreso estimado: ${detalle.ingresoEstimado.toFixed(2)}
              </p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
