"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { registrarCierre, type EstadoCierre } from "./actions";

type Fila = {
  productoId: string;
  nombre: string;
  precio: number;
  anterior: number;
  producido: number;
  disponible: number;
};

type FacturaPendiente = {
  id: string;
  numero: string | null;
  montoTotal: number;
  proveedor: { nombre: string };
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-horno-500 px-4 py-3.5 text-touch-lg text-white hover:bg-horno-600 disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Guardando…" : "Cerrar turno"}
    </button>
  );
}

export function CierreForm({
  sucursalId,
  fecha,
  tipoTurno,
  filas,
  facturasPendientes = [],
}: {
  sucursalId: string;
  fecha: string;
  tipoTurno: string;
  filas: Fila[];
  facturasPendientes?: FacturaPendiente[];
}) {
  const [sobrantes, setSobrantes] = useState<Record<string, string>>(
    Object.fromEntries(filas.map((f) => [f.productoId, ""]))
  );
  const [contado, setContado] = useState("");
  const [facturasMarcadas, setFacturasMarcadas] = useState<Set<string>>(new Set());
  const [estado, accion] = useFormState<EstadoCierre, FormData>(registrarCierre, null);

  const calculo = useMemo(() => {
    let totalVentas = 0;
    let hayNegativos = false;
    const porFila = new Map<string, { vendidos: number; valor: number }>();
    for (const f of filas) {
      const s = parseInt(sobrantes[f.productoId], 10) || 0;
      const vendidos = f.disponible - s;
      const valor = vendidos * f.precio;
      if (vendidos < 0) hayNegativos = true;
      totalVentas += valor;
      porFila.set(f.productoId, { vendidos, valor });
    }
    const totalFacturas = Array.from(facturasMarcadas).reduce((sum, id) => {
      const fp = facturasPendientes.find((f) => f.id === id);
      return sum + (fp?.montoTotal ?? 0);
    }, 0);
    const esperado = 40 + totalVentas - totalFacturas;
    const cont = parseFloat(contado) || 0;
    const descuadre = cont - esperado;
    return { totalVentas, totalFacturas, esperado, descuadre, porFila, hayNegativos };
  }, [filas, sobrantes, contado, facturasMarcadas, facturasPendientes]);

  const sobrantesJson = JSON.stringify(
    filas.map((f) => ({
      productoId: f.productoId,
      cantidad: parseInt(sobrantes[f.productoId], 10) || 0,
    }))
  );
  const facturaIdsJson = JSON.stringify([...facturasMarcadas]);

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="sucursalId" value={sucursalId} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="tipoTurno" value={tipoTurno} />
      <input type="hidden" name="sobrantes" value={sobrantesJson} />
      <input type="hidden" name="facturaIds" value={facturaIdsJson} />

      <section className="overflow-hidden rounded-panel border border-masa-200 bg-white">
        <div className="grid grid-cols-[1fr_5rem_5.5rem] items-center gap-2 border-b border-masa-200 bg-masa-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-corteza-600 sm:grid-cols-[1fr_6rem_6rem_6rem]">
          <span>Producto · disponible</span>
          <span className="text-center">Sobrante</span>
          <span className="hidden text-right sm:block">Vendidos</span>
          <span className="text-right">Valor</span>
        </div>
        <ul className="divide-y divide-masa-100">
          {filas.map((f) => {
            const r = calculo.porFila.get(f.productoId)!;
            return (
              <li
                key={f.productoId}
                className="grid grid-cols-[1fr_5rem_5.5rem] items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_6rem_6rem_6rem]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-corteza-900">{f.nombre}</p>
                  <p className="text-xs text-corteza-400">
                    {f.anterior > 0 ? `${f.anterior} ant. + ` : ""}
                    {f.producido} prod. = <strong>{f.disponible}</strong> · $
                    {f.precio.toFixed(2)} c/u
                  </p>
                </div>
                <div>
                  <label className="sr-only" htmlFor={`s-${f.productoId}`}>
                    Sobrante de {f.nombre}
                  </label>
                  <input
                    id={`s-${f.productoId}`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                    value={sobrantes[f.productoId]}
                    onChange={(e) =>
                      setSobrantes((s) => ({ ...s, [f.productoId]: e.target.value }))
                    }
                    className={`${inputCls} text-center`}
                  />
                </div>
                <p
                  className={`hidden text-right font-semibold sm:block ${
                    r.vendidos < 0 ? "text-cuadre-mal" : "text-corteza-900"
                  }`}
                >
                  {r.vendidos}
                </p>
                <p
                  className={`text-right font-semibold ${
                    r.valor < 0 ? "text-cuadre-mal" : "text-corteza-900"
                  }`}
                >
                  ${r.valor.toFixed(2)}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {calculo.hayNegativos && (
        <p
          role="alert"
          className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal"
        >
          Hay productos con más sobrante que lo disponible. Suele pasar cuando
          falta registrar un coche en Producción. Puedes guardar igual, pero
          revísalo primero.
        </p>
      )}

      {/* Facturas pendientes de caja */}
      {facturasPendientes.length > 0 && (
        <section className="rounded-panel border border-masa-200 bg-white p-5">
          <h3 className="font-bold text-corteza-900">Facturas pagadas desde esta caja</h3>
          <p className="mt-1 text-xs text-corteza-400">
            Marca las facturas que pagaste con el efectivo de este turno. Se descontarán del
            efectivo esperado.
          </p>
          <ul className="mt-3 divide-y divide-masa-100">
            {facturasPendientes.map((fp) => (
              <li key={fp.id} className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  id={`fp-${fp.id}`}
                  checked={facturasMarcadas.has(fp.id)}
                  onChange={(e) => {
                    setFacturasMarcadas((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(fp.id);
                      else next.delete(fp.id);
                      return next;
                    });
                  }}
                  className="h-5 w-5 rounded border-masa-200 accent-horno-500"
                />
                <label htmlFor={`fp-${fp.id}`} className="flex flex-1 items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold text-corteza-900">{fp.proveedor.nombre}</span>
                    {fp.numero && (
                      <span className="ml-1.5 text-corteza-400">#{fp.numero}</span>
                    )}
                  </span>
                  <span className="font-bold text-corteza-900">${fp.montoTotal.toFixed(2)}</span>
                </label>
              </li>
            ))}
          </ul>
          {calculo.totalFacturas > 0 && (
            <p className="mt-2 text-right text-sm font-semibold text-corteza-600">
              Total facturas: −${calculo.totalFacturas.toFixed(2)}
            </p>
          )}
        </section>
      )}

      <section className="rounded-panel border border-masa-200 bg-white p-5">
        <h3 className="font-bold text-corteza-900">Caja</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="efectivoContado"
              className="block text-sm font-semibold text-corteza-800"
            >
              Efectivo contado al cierre ($)
            </label>
            <input
              id="efectivoContado"
              name="efectivoContado"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              className={`mt-1.5 ${inputCls}`}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-corteza-400">
              Cuenta todo el efectivo de la caja, incluido el fondo de $40.
            </p>
          </div>
          <div>
            <label htmlFor="notas" className="block text-sm font-semibold text-corteza-800">
              Notas <span className="font-normal text-corteza-400">(opcional)</span>
            </label>
            <input
              id="notas"
              name="notas"
              className={`mt-1.5 ${inputCls}`}
              placeholder="Se regalaron 3 panes a…"
            />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-masa-100 pt-4 text-sm">
          <div>
            <dt className="text-corteza-400">Ventas del turno</dt>
            <dd className="text-lg font-bold text-corteza-900">
              ${calculo.totalVentas.toFixed(2)}
            </dd>
            {calculo.totalFacturas > 0 && (
              <dd className="text-xs text-corteza-400">−${calculo.totalFacturas.toFixed(2)} facturas</dd>
            )}
          </div>
          <div>
            <dt className="text-corteza-400">Debe haber en caja</dt>
            <dd className="text-lg font-bold text-corteza-900">
              ${calculo.esperado.toFixed(2)}
            </dd>
            <dd className="text-xs text-corteza-400">
              $40 fondo + ventas{calculo.totalFacturas > 0 ? " − facturas" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-corteza-400">Cuadre</dt>
            <dd
              className={`text-lg font-bold ${
                contado === ""
                  ? "text-corteza-400"
                  : Math.abs(calculo.descuadre) < 0.005
                    ? "text-cuadre-ok"
                    : "text-cuadre-mal"
              }`}
            >
              {contado === ""
                ? "—"
                : `${calculo.descuadre >= 0 ? "+" : "−"}$${Math.abs(calculo.descuadre).toFixed(2)}`}
            </dd>
            <dd className="text-xs text-corteza-400">
              {contado === ""
                ? "cuenta el efectivo"
                : Math.abs(calculo.descuadre) < 0.005
                  ? "la caja cuadra"
                  : calculo.descuadre < 0
                    ? "falta dinero"
                    : "sobra dinero"}
            </dd>
          </div>
        </dl>
      </section>

      {estado && !estado.ok && (
        <p
          role="alert"
          className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal"
        >
          {estado.mensaje}
        </p>
      )}

      <BotonGuardar />
    </form>
  );
}
