"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { obtenerDetalleCierre } from "./actions";

const fmtFecha = new Intl.DateTimeFormat("es-EC", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

const fmtHora = new Intl.DateTimeFormat("es-EC", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

type DetalleCierre = {
  id: string;
  fecha: string;
  tipoTurno: string;
  sucursal: { nombre: string };
  empleada: { nombre: string };
  fondoInicial: number;
  efectivoEsperado: number;
  efectivoContado: number;
  descuadre: number;
  totalTransferencias: number;
  notas?: string | null;
  filas: Array<{
    productoId: string;
    nombre: string;
    anterior: number;
    producido: number;
    disponible: number;
    sobrante: number;
    vendidos: number;
    precio: number;
    valor: number;
  }>;
  facturas: Array<{
    proveedor: { nombre: string };
    monto: number;
    estado: string;
    origenPago: string | null;
  }>;
  transferencias: Array<{
    monto: number;
    referencia: string | null;
    remitente: string | null;
    hora: string | null;
    estado: string;
  }>;
  sobrantes: Array<{ producto: { nombre: string }; cantidadSobrante: number }>;
  esAdmin: boolean;
};

export default function DetalleCierreModal({
  cierreId,
  onCerrar,
}: {
  cierreId: string | null;
  onCerrar: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleCierre | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cierreId) {
      setDetalle(null);
      setCargando(false);
      setError(null);
      return;
    }

    let cancelado = false;
    setCargando(true);
    setError(null);
    obtenerDetalleCierre(cierreId)
      .then((data) => {
        if (!cancelado) setDetalle(data as DetalleCierre);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar el cierre.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [cierreId]);

  const cuadra = Math.abs(detalle?.descuadre ?? 0) < 0.005;

  return (
    <Modal abierto={Boolean(cierreId)} onCerrar={onCerrar} titulo="Detalle de cierre">
      {cargando && <p className="text-sm text-corteza-600">Cargando…</p>}
      {error && <p className="text-sm text-cuadre-mal">{error}</p>}
      {detalle && (
        <div className="space-y-5 text-sm text-corteza-700">
          <section className="rounded-panel border border-masa-200 bg-masa-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-corteza-900">
                  {fmtFecha.format(new Date(detalle.fecha))}
                </p>
                <p className="mt-1 text-corteza-600">
                  {detalle.sucursal.nombre} · {detalle.tipoTurno}
                </p>
                <p className="mt-1 text-corteza-600">Empleada: {detalle.empleada.nombre}</p>
              </div>
              <div className={`font-bold ${cuadra ? "text-cuadre-ok" : "text-cuadre-mal"}`}>
                {cuadra ? "Cuadra" : `${detalle.descuadre < 0 ? "Falta" : "Sobra"} $${Math.abs(detalle.descuadre).toFixed(2)}`}
              </div>
            </div>
            {detalle.notas && <p className="mt-3 text-corteza-500">Nota: {detalle.notas}</p>}
            {detalle.esAdmin && (
              <div className="mt-3">
                <Link href={`/caja/${detalle.id}/editar`} className="text-sm font-semibold text-horno-600 hover:underline">
                  Editar este cierre →
                </Link>
              </div>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-corteza-900">Sobrantes y ventas por producto</h4>
            <div className="overflow-x-auto rounded-panel border border-masa-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-masa-50 text-corteza-600">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Anterior</th>
                    <th className="px-3 py-2">Producido</th>
                    <th className="px-3 py-2">Disponible</th>
                    <th className="px-3 py-2">Sobrante</th>
                    <th className="px-3 py-2">Vendidos</th>
                    <th className="px-3 py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.filas.map((fila) => (
                    <tr key={fila.productoId} className="border-t border-masa-100">
                      <td className="px-3 py-2">{fila.nombre}</td>
                      <td className="px-3 py-2">{fila.anterior}</td>
                      <td className="px-3 py-2">{fila.producido}</td>
                      <td className="px-3 py-2">{fila.disponible}</td>
                      <td className="px-3 py-2">{fila.sobrante}</td>
                      <td className="px-3 py-2">{fila.vendidos}</td>
                      <td className="px-3 py-2">${fila.valor.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-corteza-900">Facturas del turno</h4>
            {detalle.facturas.length === 0 ? (
              <p className="text-corteza-500">No hay facturas asociadas.</p>
            ) : (
              <ul className="space-y-2">
                {detalle.facturas.map((factura, index) => (
                  <li key={`${factura.proveedor.nombre}-${index}`} className="rounded-lg border border-masa-200 p-3">
                    <p className="font-semibold text-corteza-800">{factura.proveedor.nombre}</p>
                    <p className="text-corteza-600">
                      Monto: ${factura.monto.toFixed(2)} · Estado: {factura.estado} · Origen: {factura.origenPago ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-corteza-900">Transferencias confirmadas</h4>
            {detalle.transferencias.length === 0 ? (
              <p className="text-corteza-500">No hay transferencias confirmadas.</p>
            ) : (
              <ul className="space-y-2">
                {detalle.transferencias.map((t, index) => (
                  <li key={`${t.referencia ?? "tr"}-${index}`} className="rounded-lg border border-masa-200 p-3">
                    <p className="font-semibold text-corteza-800">${t.monto.toFixed(2)}</p>
                    <p className="text-corteza-600">
                      {t.referencia ?? "Sin referencia"} · {t.remitente ?? "Sin remitente"} · {t.hora ? fmtHora.format(new Date(t.hora)) : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-corteza-900">Resumen de caja</h4>
            <div className="space-y-2 rounded-panel border border-masa-200 bg-masa-50 p-4">
              <p>Fondo inicial: ${detalle.fondoInicial.toFixed(2)}</p>
              <p>Efectivo esperado: ${detalle.efectivoEsperado.toFixed(2)}</p>
              <p>Efectivo contado: ${detalle.efectivoContado.toFixed(2)}</p>
              <p>Descuadre: ${detalle.descuadre.toFixed(2)}</p>
              <p>Total transferencias: ${detalle.totalTransferencias.toFixed(2)}</p>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
