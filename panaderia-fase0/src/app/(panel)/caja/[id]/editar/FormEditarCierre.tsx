"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { editarCierre, eliminarCierre, type EstadoCierre } from "../../actions";

type Fila = {
  productoId: string;
  nombre: string;
  precio: number;
  anterior: number;
  producido: number;
  disponible: number;
  sobranteActual: number;
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

function BotonGuardar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600 disabled:opacity-60"
    >
      {pending ? "Guardando…" : texto}
    </button>
  );
}

function MensajeEstado({ estado }: { estado: EstadoCierre }) {
  if (!estado) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
        estado.ok ? "bg-cuadre-ok/10 text-cuadre-ok" : "bg-cuadre-mal/10 text-cuadre-mal"
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

export function FormEditarCierre({
  cierreId,
  filas: filasIniciales,
  efectivoContadoInicial,
  notasInicial,
}: {
  cierreId: string;
  filas: Fila[];
  efectivoContadoInicial: number;
  notasInicial: string;
}) {
  const [sobrantes, setSobrantes] = useState<Record<string, string>>(
    Object.fromEntries(filasIniciales.map((f) => [f.productoId, String(f.sobranteActual)]))
  );
  const [contado, setContado] = useState(String(efectivoContadoInicial));
  const [estadoEditar, accionEditar] = useFormState<EstadoCierre, FormData>(editarCierre, null);
  const [estadoEliminar, accionEliminar] = useFormState<EstadoCierre, FormData>(eliminarCierre, null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  const calculo = useMemo(() => {
    let totalVentas = 0;
    for (const f of filasIniciales) {
      const s = parseInt(sobrantes[f.productoId] ?? "0", 10) || 0;
      const vendidos = f.disponible - s;
      totalVentas += vendidos * f.precio;
    }
    const esperado = 40 + totalVentas;
    const cont = parseFloat(contado) || 0;
    const descuadre = cont - esperado;
    return { totalVentas, esperado, descuadre };
  }, [filasIniciales, sobrantes, contado]);

  const sobrantesJson = JSON.stringify(
    filasIniciales.map((f) => ({
      productoId: f.productoId,
      cantidad: parseInt(sobrantes[f.productoId] ?? "0", 10) || 0,
    }))
  );

  return (
    <div className="space-y-5">
      {/* Formulario de edición */}
      <form action={accionEditar} className="space-y-5">
        <input type="hidden" name="id" value={cierreId} />
        <input type="hidden" name="sobrantes" value={sobrantesJson} />

        <section className="overflow-hidden rounded-panel border border-masa-200 bg-white">
          <div className="grid grid-cols-[1fr_5rem_5.5rem] items-center gap-2 border-b border-masa-200 bg-masa-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-corteza-600 sm:grid-cols-[1fr_6rem_6rem_6rem]">
            <span>Producto · disponible</span>
            <span className="text-center">Sobrante</span>
            <span className="hidden text-right sm:block">Vendidos</span>
            <span className="text-right">Valor</span>
          </div>
          <ul className="divide-y divide-masa-100">
            {filasIniciales.map((f) => {
              const s = parseInt(sobrantes[f.productoId] ?? "0", 10) || 0;
              const vendidos = f.disponible - s;
              const valor = vendidos * f.precio;
              return (
                <li
                  key={f.productoId}
                  className="grid grid-cols-[1fr_5rem_5.5rem] items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_6rem_6rem_6rem]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-corteza-900">{f.nombre}</p>
                    <p className="text-xs text-corteza-400">
                      {f.anterior > 0 ? `${f.anterior} ant. + ` : ""}
                      {f.producido} prod. = <strong>{f.disponible}</strong> · ${f.precio.toFixed(2)} c/u
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
                      value={sobrantes[f.productoId] ?? "0"}
                      onChange={(e) =>
                        setSobrantes((prev) => ({ ...prev, [f.productoId]: e.target.value }))
                      }
                      className={`${inputCls} text-center`}
                    />
                  </div>
                  <p className={`hidden text-right font-semibold sm:block ${vendidos < 0 ? "text-cuadre-mal" : "text-corteza-900"}`}>
                    {vendidos}
                  </p>
                  <p className={`text-right font-semibold ${valor < 0 ? "text-cuadre-mal" : "text-corteza-900"}`}>
                    ${valor.toFixed(2)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-panel border border-masa-200 bg-white p-5">
          <h3 className="font-bold text-corteza-900">Caja</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="efectivoContado" className="block text-sm font-semibold text-corteza-800">
                Efectivo contado ($)
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
              />
            </div>
            <div>
              <label htmlFor="notas" className="block text-sm font-semibold text-corteza-800">
                Notas <span className="font-normal text-corteza-400">(opcional)</span>
              </label>
              <input
                id="notas"
                name="notas"
                defaultValue={notasInicial}
                className={`mt-1.5 ${inputCls}`}
                placeholder="Se regalaron 3 panes a…"
              />
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-masa-100 pt-4 text-sm">
            <div>
              <dt className="text-corteza-400">Ventas estimadas</dt>
              <dd className="text-lg font-bold text-corteza-900">${calculo.totalVentas.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-corteza-400">Debe haber en caja</dt>
              <dd className="text-lg font-bold text-corteza-900">${calculo.esperado.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-corteza-400">Cuadre estimado</dt>
              <dd className={`text-lg font-bold ${Math.abs(calculo.descuadre) < 0.005 ? "text-cuadre-ok" : "text-cuadre-mal"}`}>
                {calculo.descuadre >= 0 ? "+" : "−"}${Math.abs(calculo.descuadre).toFixed(2)}
              </dd>
              <dd className="text-xs text-corteza-400">sin descontar facturas de caja</dd>
            </div>
          </dl>
        </section>

        <div className="flex gap-3">
          <BotonGuardar texto="Guardar cambios" />
        </div>
        <MensajeEstado estado={estadoEditar} />
      </form>

      {/* Eliminación */}
      <section className="rounded-panel border border-cuadre-mal/30 bg-cuadre-mal/5 p-5">
        <h3 className="font-bold text-cuadre-mal">Zona peligrosa</h3>
        <p className="mt-1 text-sm text-corteza-700">
          Para corregir la sucursal, fecha o turno: elimina este cierre y ciérralo de nuevo correctamente.
        </p>
        <p className="mt-1 text-sm text-corteza-600">
          Al eliminar: se borrarán las ventas calculadas y las facturas pagadas desde esta caja
          volverán a estado Pendiente.
        </p>

        {!confirmandoEliminar ? (
          <button
            type="button"
            onClick={() => setConfirmandoEliminar(true)}
            className="mt-3 rounded-lg bg-cuadre-mal/10 px-4 py-2 text-sm font-semibold text-cuadre-mal hover:bg-cuadre-mal/20"
          >
            Eliminar cierre
          </button>
        ) : (
          <form action={accionEliminar} className="mt-3">
            <input type="hidden" name="id" value={cierreId} />
            <p className="mb-3 text-sm font-semibold text-cuadre-mal">
              ¿Confirmas que quieres eliminar este cierre? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <BotonGuardar texto="Sí, eliminar definitivamente" />
              <button
                type="button"
                onClick={() => setConfirmandoEliminar(false)}
                className="rounded-lg border border-masa-200 px-4 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
              >
                Cancelar
              </button>
            </div>
            <MensajeEstado estado={estadoEliminar} />
          </form>
        )}
      </section>
    </div>
  );
}
