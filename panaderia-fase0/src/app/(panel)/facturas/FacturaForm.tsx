"use client";

import { useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { crearFactura, type EstadoFactura } from "./actions";
import { dinero } from "@/lib/catalogo";
import type { InsumoConUltimoCosto } from "@/lib/facturas";

type Proveedor = { id: string; nombre: string };
type Sucursal = { id: string; nombre: string };

type LineaEstado = {
  uid: string;
  insumoId: string; // "" = sin elegir, "__nuevo__" = crear, otro = ID existente
  insumoNuevoNombre: string;
  insumoNuevoUnidad: string;
  cantidad: string;
  costoTotal: string;
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";
const labelCls = "block text-sm font-semibold text-corteza-800";

function BotonGuardar({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-lg bg-horno-500 px-4 py-3.5 text-touch-lg text-white hover:bg-horno-600 disabled:opacity-60 sm:w-auto"
    >
      {pending ? "Guardando…" : "Guardar factura"}
    </button>
  );
}

export function FacturaForm({
  proveedores,
  insumos,
  sucursales,
  hoy,
}: {
  proveedores: Proveedor[];
  insumos: InsumoConUltimoCosto[];
  sucursales: Sucursal[];
  hoy: string;
}) {
  // Estado del proveedor
  const [proveedorId, setProveedorId] = useState("");
  const [provNombre, setProvNombre] = useState("");
  const [provContacto, setProvContacto] = useState("");
  const [provTelefono, setProvTelefono] = useState("");

  // Metadatos de la factura
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoy);
  const [numero, setNumero] = useState("");

  // Líneas de compra
  const siguienteUid = useRef(2);
  const [lineas, setLineas] = useState<LineaEstado[]>([
    { uid: "1", insumoId: "", insumoNuevoNombre: "", insumoNuevoUnidad: "", cantidad: "", costoTotal: "" },
  ]);

  const [estado, accion] = useFormState<EstadoFactura, FormData>(crearFactura, null);

  const agregarLinea = () => {
    setLineas((prev) => [
      ...prev,
      {
        uid: String(siguienteUid.current++),
        insumoId: "",
        insumoNuevoNombre: "",
        insumoNuevoUnidad: "",
        cantidad: "",
        costoTotal: "",
      },
    ]);
  };

  const quitarLinea = (uid: string) => {
    setLineas((prev) => prev.filter((l) => l.uid !== uid));
  };

  const actualizarLinea = (uid: string, cambios: Partial<LineaEstado>) => {
    setLineas((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));
  };

  // Costo unitario en vivo por línea
  const costoUnitarioDe = (l: LineaEstado): number | null => {
    const qty = parseFloat(l.cantidad);
    const cost = parseFloat(l.costoTotal);
    if (qty > 0 && cost > 0) return Math.round((cost / qty) * 10000) / 10000;
    return null;
  };

  // Último costo de referencia para el insumo elegido
  const ultimoCostoDe = (insumoId: string): number | null => {
    return insumos.find((i) => i.id === insumoId)?.ultimoCostoUnitario ?? null;
  };

  // Total de la factura en vivo
  const total = useMemo(
    () =>
      lineas.reduce((sum, l) => {
        const c = parseFloat(l.costoTotal);
        return sum + (isNaN(c) ? 0 : c);
      }, 0),
    [lineas]
  );

  // Validación para habilitar el botón
  const puedeGuardar = useMemo(() => {
    if (!sucursalId || !fecha) return false;
    if (!proveedorId) return false;
    if (proveedorId === "__nuevo__" && !provNombre.trim()) return false;
    if (lineas.length === 0) return false;
    for (const l of lineas) {
      if (!l.insumoId) return false;
      if (l.insumoId === "__nuevo__" && (!l.insumoNuevoNombre.trim() || !l.insumoNuevoUnidad.trim()))
        return false;
      const qty = parseFloat(l.cantidad);
      const cost = parseFloat(l.costoTotal);
      if (!(qty > 0) || !(cost > 0)) return false;
    }
    return true;
  }, [sucursalId, fecha, proveedorId, provNombre, lineas]);

  // Serialización del payload (sigue el patrón de sobrantes en CierreForm)
  const payload = JSON.stringify({
    proveedorId: proveedorId !== "__nuevo__" ? proveedorId : undefined,
    proveedorNuevo:
      proveedorId === "__nuevo__"
        ? {
            nombre: provNombre.trim(),
            contacto: provContacto.trim() || null,
            telefono: provTelefono.trim() || null,
          }
        : undefined,
    sucursalId,
    fecha,
    numero: numero.trim() || null,
    lineas: lineas.map((l) => ({
      insumoId: l.insumoId !== "__nuevo__" ? l.insumoId || undefined : undefined,
      insumoNuevo:
        l.insumoId === "__nuevo__"
          ? { nombre: l.insumoNuevoNombre.trim(), unidadMedida: l.insumoNuevoUnidad.trim() }
          : undefined,
      cantidad: parseFloat(l.cantidad) || 0,
      costoTotal: parseFloat(l.costoTotal) || 0,
    })),
  });

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />

      {/* Proveedor */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-4">
        <h3 className="font-bold text-corteza-900">Proveedor</h3>
        <div>
          <label htmlFor="proveedor" className={labelCls}>
            Proveedor
          </label>
          <select
            id="proveedor"
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className={`mt-1.5 ${inputCls}`}
          >
            <option value="">-- Elige un proveedor --</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            <option value="__nuevo__">+ Proveedor nuevo…</option>
          </select>
        </div>

        {proveedorId === "__nuevo__" && (
          <div className="grid gap-3 rounded-lg bg-masa-50 p-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>
                Nombre <span className="font-normal text-cuadre-mal">*</span>
              </label>
              <input
                type="text"
                value={provNombre}
                onChange={(e) => setProvNombre(e.target.value)}
                placeholder="Distribuidora…"
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label className={labelCls}>Contacto</label>
              <input
                type="text"
                value={provContacto}
                onChange={(e) => setProvContacto(e.target.value)}
                placeholder="Juan Pérez"
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input
                type="tel"
                value={provTelefono}
                onChange={(e) => setProvTelefono(e.target.value)}
                placeholder="0991234567"
                className={`mt-1 ${inputCls}`}
              />
            </div>
          </div>
        )}
      </section>

      {/* Datos de la factura */}
      <section className="rounded-panel border border-masa-200 bg-white p-5">
        <h3 className="font-bold text-corteza-900">Datos de la factura</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="sucursal" className={labelCls}>
              Sucursal que recibe
            </label>
            <select
              id="sucursal"
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className={`mt-1.5 ${inputCls}`}
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fecha-fact" className={labelCls}>
              Fecha de la factura
            </label>
            <input
              id="fecha-fact"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={`mt-1.5 ${inputCls}`}
            />
          </div>
          <div>
            <label htmlFor="numero" className={labelCls}>
              N.º de factura <span className="font-normal text-corteza-400">(opcional)</span>
            </label>
            <input
              id="numero"
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="001-001-000000123"
              className={`mt-1.5 ${inputCls}`}
            />
          </div>
        </div>
      </section>

      {/* Líneas de insumos */}
      <section className="rounded-panel border border-masa-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-masa-200 bg-masa-50 px-4 py-2.5">
          <h3 className="font-bold text-corteza-900">Insumos comprados</h3>
          <button
            type="button"
            onClick={agregarLinea}
            className="rounded-lg border border-horno-500 px-3 py-1.5 text-sm font-semibold text-horno-600 hover:bg-horno-500/10"
          >
            + Agregar línea
          </button>
        </div>

        {lineas.length === 0 && (
          <p className="px-4 py-6 text-sm text-corteza-400">
            No hay líneas. Usa el botón para agregar insumos.
          </p>
        )}

        <ul className="divide-y divide-masa-100">
          {lineas.map((l) => {
            const cu = costoUnitarioDe(l);
            const ref = ultimoCostoDe(l.insumoId);
            return (
              <li key={l.uid} className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label className={labelCls}>Insumo</label>
                    <select
                      value={l.insumoId}
                      onChange={(e) =>
                        actualizarLinea(l.uid, {
                          insumoId: e.target.value,
                          insumoNuevoNombre: "",
                          insumoNuevoUnidad: "",
                        })
                      }
                      className={`mt-1 ${inputCls}`}
                    >
                      <option value="">-- Elige un insumo --</option>
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nombre} ({i.unidadMedida})
                        </option>
                      ))}
                      <option value="__nuevo__">+ Insumo nuevo…</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => quitarLinea(l.uid)}
                      className="rounded-lg border border-masa-200 px-3 py-2.5 text-sm text-corteza-400 hover:bg-cuadre-mal/10 hover:text-cuadre-mal"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                {l.insumoId === "__nuevo__" && (
                  <div className="grid gap-3 rounded-lg bg-masa-50 p-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>
                        Nombre del insumo <span className="font-normal text-cuadre-mal">*</span>
                      </label>
                      <input
                        type="text"
                        value={l.insumoNuevoNombre}
                        onChange={(e) => actualizarLinea(l.uid, { insumoNuevoNombre: e.target.value })}
                        placeholder="Harina de trigo"
                        className={`mt-1 ${inputCls}`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        Unidad de medida <span className="font-normal text-cuadre-mal">*</span>
                      </label>
                      <input
                        type="text"
                        value={l.insumoNuevoUnidad}
                        onChange={(e) => actualizarLinea(l.uid, { insumoNuevoUnidad: e.target.value })}
                        placeholder="quintal, kg, litro…"
                        className={`mt-1 ${inputCls}`}
                      />
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>Cantidad</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0.001"
                      value={l.cantidad}
                      onChange={(e) => actualizarLinea(l.uid, { cantidad: e.target.value })}
                      placeholder="0"
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Costo total ($)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={l.costoTotal}
                      onChange={(e) => actualizarLinea(l.uid, { costoTotal: e.target.value })}
                      placeholder="0.00"
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-0.5">
                    <p className="text-xs text-corteza-400">Costo unitario</p>
                    <p className="text-base font-bold text-corteza-900">
                      {cu !== null ? dinero(cu) : "—"}
                    </p>
                    {ref !== null && l.insumoId && l.insumoId !== "__nuevo__" && (
                      <p className="text-xs text-corteza-400">
                        Último pagado: {dinero(ref)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {lineas.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t border-masa-200 bg-masa-50 px-4 py-3">
            <span className="text-sm text-corteza-600">Total de la factura:</span>
            <span className="text-lg font-bold text-corteza-900">{dinero(total)}</span>
          </div>
        )}
      </section>

      {estado && !estado.ok && (
        <p
          role="alert"
          className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal"
        >
          {estado.mensaje}
        </p>
      )}

      <BotonGuardar disabled={!puedeGuardar} />
    </form>
  );
}
