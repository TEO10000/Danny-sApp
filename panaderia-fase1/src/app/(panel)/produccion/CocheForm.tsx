"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { registrarCoche, type EstadoCoche } from "./actions";

type ProductoOpcion = { id: string; nombre: string; precio: number | null };
type Sucursal = { id: string; nombre: string };

type Fila = {
  clave: number;
  productoId: string;
  numLatas: string;
  panesPorLata: string;
  mermas: string;
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

function filaVacia(clave: number): Fila {
  return { clave, productoId: "", numLatas: "", panesPorLata: "", mermas: "0" };
}

function BotonGuardar({ deshabilitado }: { deshabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || deshabilitado}
      className="w-full rounded-lg bg-horno-500 px-4 py-3.5 text-touch-lg text-white hover:bg-horno-600 disabled:opacity-50 sm:w-auto"
    >
      {pending ? "Guardando…" : "Guardar coche"}
    </button>
  );
}

export function CocheForm({
  productos,
  sucursales,
  hoy,
}: {
  productos: ProductoOpcion[];
  sucursales: Sucursal[];
  hoy: string;
}) {
  const [filas, setFilas] = useState<Fila[]>([filaVacia(0)]);
  const [estado, accion] = useFormState<EstadoCoche, FormData>(registrarCoche, null);

  const editar = (clave: number, campo: keyof Fila, valor: string) => {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, [campo]: valor } : f)));
  };

  const totales = useMemo(() => {
    let latas = 0;
    let panes = 0;
    let mermas = 0;
    let ingreso = 0;
    for (const f of filas) {
      const nl = parseInt(f.numLatas, 10) || 0;
      const ppl = parseInt(f.panesPorLata, 10) || 0;
      const m = parseInt(f.mermas, 10) || 0;
      const buenos = Math.max(nl * ppl - m, 0);
      latas += nl;
      panes += nl * ppl;
      mermas += m;
      const precio = productos.find((p) => p.id === f.productoId)?.precio ?? 0;
      ingreso += buenos * precio;
    }
    return { latas, panes, mermas, ingreso };
  }, [filas, productos]);

  const filasCompletas = filas.filter(
    (f) => f.productoId && parseInt(f.numLatas, 10) > 0 && parseInt(f.panesPorLata, 10) > 0
  );

  const detallesJson = JSON.stringify(
    filasCompletas.map((f) => ({
      productoId: f.productoId,
      numLatas: parseInt(f.numLatas, 10),
      panesPorLata: parseInt(f.panesPorLata, 10),
      mermas: parseInt(f.mermas, 10) || 0,
    }))
  );

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="detalles" value={detallesJson} />

      <div className="grid gap-4 rounded-panel border border-masa-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sucursalId" className="block text-sm font-semibold text-corteza-800">
            Sucursal de destino
          </label>
          <select id="sucursalId" name="sucursalId" required className={`mt-1.5 ${inputCls}`}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fecha" className="block text-sm font-semibold text-corteza-800">
            Fecha de la hornada
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            required
            defaultValue={hoy}
            className={`mt-1.5 ${inputCls}`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notas" className="block text-sm font-semibold text-corteza-800">
            Notas <span className="font-normal text-corteza-400">(opcional)</span>
          </label>
          <input
            id="notas"
            name="notas"
            className={`mt-1.5 ${inputCls}`}
            placeholder="Coche de la tarde, masa nueva…"
          />
        </div>
      </div>

      <section className="space-y-3">
        {filas.map((f, i) => {
          const nl = parseInt(f.numLatas, 10) || 0;
          const ppl = parseInt(f.panesPorLata, 10) || 0;
          const m = parseInt(f.mermas, 10) || 0;
          const buenos = Math.max(nl * ppl - m, 0);
          return (
            <div key={f.clave} className="rounded-panel border border-masa-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-corteza-400">Pan {i + 1}</span>
                {filas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-cuadre-mal hover:bg-cuadre-mal/10"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-corteza-600">Producto</label>
                  <select
                    value={f.productoId}
                    onChange={(e) => editar(f.clave, "productoId", e.target.value)}
                    className={`mt-1 ${inputCls}`}
                  >
                    <option value="">Elegir…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-corteza-600">Latas</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={f.numLatas}
                    onChange={(e) => editar(f.clave, "numLatas", e.target.value)}
                    className={`mt-1 ${inputCls}`}
                    placeholder="14"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-corteza-600">
                    Panes/lata
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={f.panesPorLata}
                    onChange={(e) => editar(f.clave, "panesPorLata", e.target.value)}
                    className={`mt-1 ${inputCls}`}
                    placeholder="20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-corteza-600">Mermas</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={f.mermas}
                    onChange={(e) => editar(f.clave, "mermas", e.target.value)}
                    className={`mt-1 ${inputCls}`}
                  />
                </div>
              </div>
              {nl > 0 && ppl > 0 && (
                <p className="mt-2 text-sm text-corteza-600">
                  {nl} latas × {ppl} = <strong>{nl * ppl} panes</strong>
                  {m > 0 ? ` (${buenos} buenos tras ${m} de merma)` : ""}
                </p>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setFilas((fs) => [...fs, filaVacia(Date.now())])}
          className="w-full rounded-panel border-2 border-dashed border-masa-200 px-4 py-3 font-semibold text-corteza-600 hover:border-horno-400 hover:text-horno-600"
        >
          + Agregar otro pan al coche
        </button>
      </section>

      <section className="rounded-panel border border-masa-200 bg-white p-5">
        <h3 className="font-bold text-corteza-900">Resumen del coche</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-corteza-400">Latas</dt>
            <dd className="text-lg font-bold text-corteza-900">{totales.latas}</dd>
          </div>
          <div>
            <dt className="text-corteza-400">Panes</dt>
            <dd className="text-lg font-bold text-corteza-900">{totales.panes}</dd>
          </div>
          <div>
            <dt className="text-corteza-400">Mermas</dt>
            <dd
              className={`text-lg font-bold ${
                totales.mermas > 0 ? "text-cuadre-mal" : "text-corteza-900"
              }`}
            >
              {totales.mermas}
            </dd>
          </div>
          <div>
            <dt className="text-corteza-400">Ingreso estimado</dt>
            <dd className="text-lg font-bold text-cuadre-ok">
              ${totales.ingreso.toFixed(2)}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-corteza-400">
          Ingreso si se vende todo el pan bueno al precio vigente. La ganancia
          neta se mostrará cuando se registren los costos de insumos (Fase 3).
        </p>
      </section>

      {estado && !estado.ok && (
        <p
          role="alert"
          className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal"
        >
          {estado.mensaje}
        </p>
      )}

      <BotonGuardar deshabilitado={filasCompletas.length === 0} />
    </form>
  );
}
