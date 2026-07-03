"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { editarCierre, eliminarCierre, editarTransferencias, type EstadoCierre } from "../../actions";

type Fila = {
  productoId: string;
  nombre: string;
  precio: number;
  anterior: number;
  producido: number;
  disponible: number;
  sobranteActual: number;
};

type TransferenciaCierre = {
  id: string;
  monto: number;
  referencia: string | null;
  remitente: string | null;
  hora: string | null;
  estado: "CONFIRMADA" | "DESCARTADA";
  origen: "CORREO" | "MANUAL";
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

const fmtHoraEC = new Intl.DateTimeFormat("es-EC", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
  hour12: false,
});

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
  transferencias = [],
  totalTransferenciasActual = 0,
}: {
  cierreId: string;
  filas: Fila[];
  efectivoContadoInicial: number;
  notasInicial: string;
  transferencias?: TransferenciaCierre[];
  totalTransferenciasActual?: number;
}) {
  const [sobrantes, setSobrantes] = useState<Record<string, string>>(
    Object.fromEntries(filasIniciales.map((f) => [f.productoId, String(f.sobranteActual)]))
  );
  const [contado, setContado] = useState(String(efectivoContadoInicial));
  const [estadoEditar, accionEditar] = useFormState<EstadoCierre, FormData>(editarCierre, null);
  const [estadoEliminar, accionEliminar] = useFormState<EstadoCierre, FormData>(eliminarCierre, null);
  const [estadoTransf, accionTransf] = useFormState<EstadoCierre, FormData>(editarTransferencias, null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  // Transferencias de correo (admin puede cambiar CONFIRMADA↔DESCARTADA)
  const transCorreo = transferencias.filter((t) => t.origen === "CORREO");
  const transManual = transferencias.filter((t) => t.origen === "MANUAL");
  const [confirmadasIds, setConfirmadasIds] = useState<Set<string>>(
    new Set(transCorreo.filter((t) => t.estado === "CONFIRMADA").map((t) => t.id))
  );
  const [manualesNuevas, setManualesNuevas] = useState<Array<{ monto: string; referencia: string }>>([]);

  const calculo = useMemo(() => {
    let totalVentas = 0;
    for (const f of filasIniciales) {
      const s = parseInt(sobrantes[f.productoId] ?? "0", 10) || 0;
      const vendidos = f.disponible - s;
      totalVentas += vendidos * f.precio;
    }
    const esperado = 40 + totalVentas - totalTransferenciasActual;
    const cont = parseFloat(contado) || 0;
    const descuadre = cont - esperado;
    return { totalVentas, esperado, descuadre };
  }, [filasIniciales, sobrantes, contado, totalTransferenciasActual]);

  const sobrantesJson = JSON.stringify(
    filasIniciales.map((f) => ({
      productoId: f.productoId,
      cantidad: parseInt(sobrantes[f.productoId] ?? "0", 10) || 0,
    }))
  );

  const confirmadasIdsJson = JSON.stringify([...confirmadasIds]);
  const manualesNuevasJson = JSON.stringify(
    manualesNuevas
      .filter((m) => parseFloat(m.monto) > 0)
      .map((m) => ({ monto: parseFloat(m.monto), referencia: m.referencia || undefined }))
  );

  function agregarManual() {
    setManualesNuevas((prev) => [...prev, { monto: "", referencia: "" }]);
  }
  function actualizarManual(idx: number, campo: "monto" | "referencia", valor: string) {
    setManualesNuevas((prev) => prev.map((m, i) => (i === idx ? { ...m, [campo]: valor } : m)));
  }
  function quitarManual(idx: number) {
    setManualesNuevas((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-5">
      {/* Formulario de edición de sobrantes y efectivo */}
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
              {totalTransferenciasActual > 0 && (
                <dd className="text-xs text-corteza-400">−${totalTransferenciasActual.toFixed(2)} transf.</dd>
              )}
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

      {/* Sección de transferencias del cierre */}
      <section className="rounded-panel border border-masa-200 bg-white p-5">
        <h3 className="font-bold text-corteza-900">Transferencias del cierre</h3>
        <p className="mt-1 text-xs text-corteza-400">
          Marca las transferencias confirmadas para incluirlas en el efectivo esperado.
        </p>

        {transCorreo.length === 0 && transManual.length === 0 && manualesNuevas.length === 0 && (
          <p className="mt-3 text-sm text-corteza-400">
            Sin transferencias registradas para este cierre.
          </p>
        )}

        {(transCorreo.length > 0 || transManual.length > 0) && (
          <ul className="mt-3 divide-y divide-masa-100">
            {transCorreo.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  id={`tc-${t.id}`}
                  checked={confirmadasIds.has(t.id)}
                  onChange={(e) => {
                    setConfirmadasIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      return next;
                    });
                  }}
                  className="h-5 w-5 rounded border-masa-200 accent-horno-500"
                />
                <label htmlFor={`tc-${t.id}`} className="flex flex-1 items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold text-corteza-900">${t.monto.toFixed(2)}</span>
                    {t.hora && (
                      <span className="ml-1.5 text-corteza-400">{fmtHoraEC.format(new Date(t.hora))}</span>
                    )}
                    {t.referencia && <span className="ml-1.5 text-corteza-400">#{t.referencia}</span>}
                    {t.remitente && <span className="ml-1.5 text-xs text-corteza-400"> · {t.remitente}</span>}
                  </span>
                  <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs text-corteza-500">correo</span>
                </label>
              </li>
            ))}
            {transManual.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5 opacity-70">
                <span className="h-5 w-5 flex items-center justify-center text-cuadre-ok text-sm">✓</span>
                <span className="flex flex-1 items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-semibold text-corteza-900">${t.monto.toFixed(2)}</span>
                    {t.referencia && <span className="ml-1.5 text-corteza-400">#{t.referencia}</span>}
                  </span>
                  <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs text-corteza-500">manual</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {manualesNuevas.length > 0 && (
          <ul className="mt-3 space-y-2">
            {manualesNuevas.map((m, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  placeholder="Monto $"
                  value={m.monto}
                  onChange={(e) => actualizarManual(idx, "monto", e.target.value)}
                  className={`${inputCls} w-32`}
                />
                <input
                  type="text"
                  placeholder="Ref. / nota (opcional)"
                  value={m.referencia}
                  onChange={(e) => actualizarManual(idx, "referencia", e.target.value)}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => quitarManual(idx)}
                  className="rounded-lg border border-masa-200 px-2.5 py-2 text-xs font-semibold text-corteza-500 hover:bg-masa-100"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={agregarManual}
          className="mt-3 rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        >
          + Agregar transferencia manual
        </button>

        <form action={accionTransf} className="mt-4">
          <input type="hidden" name="cierreId" value={cierreId} />
          <input type="hidden" name="confirmadasIds" value={confirmadasIdsJson} />
          <input type="hidden" name="manualesNuevas" value={manualesNuevasJson} />
          <BotonGuardar texto="Guardar transferencias y recalcular" />
        </form>
        <MensajeEstado estado={estadoTransf} />
      </section>

      {/* Eliminación */}
      <section className="rounded-panel border border-cuadre-mal/30 bg-cuadre-mal/5 p-5">
        <h3 className="font-bold text-cuadre-mal">Zona peligrosa</h3>
        <p className="mt-1 text-sm text-corteza-700">
          Para corregir la sucursal, fecha o turno: elimina este cierre y ciérralo de nuevo correctamente.
        </p>
        <p className="mt-1 text-sm text-corteza-600">
          Al eliminar: se borrarán las ventas calculadas, las facturas de caja vuelven a Pendiente y
          las transferencias de correo vuelven a estado Sugerida.
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
