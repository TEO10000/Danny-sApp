"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { editarFactura, type EstadoFactura } from "../../actions";

type Proveedor = { id: string; nombre: string };
type Sucursal = { id: string; nombre: string };
type Insumo = { id: string; nombre: string; unidadMedida: string };
type LineaInicial = { insumoId: string; insumoNombre: string; cantidad: number; costoTotal: number };

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600 disabled:opacity-60">
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}

export function FormEditarFactura({
  facturaId,
  initialProveedorId,
  initialSucursalId,
  initialFecha,
  initialNumero,
  initialLineas,
  proveedores,
  sucursales,
  insumos,
}: {
  facturaId: string;
  initialProveedorId: string;
  initialSucursalId: string;
  initialFecha: string;
  initialNumero: string;
  initialLineas: LineaInicial[];
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  insumos: Insumo[];
}) {
  const [lineas, setLineas] = useState(
    initialLineas.map((l, i) => ({ clave: i, ...l }))
  );
  const [estado, accion] = useFormState<EstadoFactura, FormData>(editarFactura, null);

  const editarLinea = (clave: number, campo: string, valor: string | number) => {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));
  };

  const montoTotal = lineas.reduce((s, l) => s + (Number(l.costoTotal) || 0), 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const payload = {
      id: facturaId,
      proveedorId: (e.currentTarget.elements.namedItem("proveedorId") as HTMLSelectElement)?.value,
      sucursalId: (e.currentTarget.elements.namedItem("sucursalId") as HTMLSelectElement)?.value,
      fecha: (e.currentTarget.elements.namedItem("fecha") as HTMLInputElement)?.value,
      numero: (e.currentTarget.elements.namedItem("numero") as HTMLInputElement)?.value ?? "",
      lineas: lineas.map((l) => ({
        insumoId: l.insumoId,
        cantidad: Number(l.cantidad),
        costoTotal: Number(l.costoTotal),
      })),
    };
    (e.currentTarget.elements.namedItem("payload") as HTMLInputElement).value = JSON.stringify(payload);
  };

  return (
    <form action={accion} onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="payload" defaultValue="" />

      <div className="grid gap-4 rounded-panel border border-masa-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="proveedorId" className="block text-sm font-semibold text-corteza-800">Proveedor</label>
          <select id="proveedorId" name="proveedorId" defaultValue={initialProveedorId} required className={`mt-1.5 ${inputCls}`}>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sucursalId" className="block text-sm font-semibold text-corteza-800">Sucursal</label>
          <select id="sucursalId" name="sucursalId" defaultValue={initialSucursalId} required className={`mt-1.5 ${inputCls}`}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fecha" className="block text-sm font-semibold text-corteza-800">Fecha</label>
          <input id="fecha" name="fecha" type="date" defaultValue={initialFecha} required className={`mt-1.5 ${inputCls}`} />
        </div>
        <div>
          <label htmlFor="numero" className="block text-sm font-semibold text-corteza-800">
            N.° de factura <span className="font-normal text-corteza-400">(opcional)</span>
          </label>
          <input id="numero" name="numero" defaultValue={initialNumero} className={`mt-1.5 ${inputCls}`} placeholder="001-001-000000123" />
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="font-bold text-corteza-900">Líneas de compra</h3>
        {lineas.map((l, idx) => (
          <div key={l.clave} className="rounded-panel border border-masa-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-corteza-400">Línea {idx + 1}</span>
              {lineas.length > 1 && (
                <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} className="text-sm font-semibold text-cuadre-mal hover:bg-cuadre-mal/10 rounded-lg px-2 py-1">
                  Quitar
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-corteza-600">Insumo</label>
                <select value={l.insumoId} onChange={(e) => editarLinea(l.clave, "insumoId", e.target.value)} required className={`mt-1 ${inputCls}`}>
                  <option value="">Seleccionar…</option>
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidadMedida})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-corteza-600">Cantidad</label>
                <input type="number" inputMode="decimal" step="0.001" min="0.001" value={l.cantidad} onChange={(e) => editarLinea(l.clave, "cantidad", e.target.value)} required className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-corteza-600">Costo total ($)</label>
                <input type="number" inputMode="decimal" step="0.01" min="0.01" value={l.costoTotal} onChange={(e) => editarLinea(l.clave, "costoTotal", e.target.value)} required className={`mt-1 ${inputCls}`} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setLineas((ls) => [...ls, { clave: Date.now(), insumoId: "", insumoNombre: "", cantidad: 0, costoTotal: 0 }])} className="w-full rounded-panel border-2 border-dashed border-masa-200 px-4 py-3 font-semibold text-corteza-600 hover:border-horno-400 hover:text-horno-600">
          + Agregar línea
        </button>
      </section>

      <div className="flex items-center justify-between rounded-panel border border-masa-200 bg-white p-4">
        <div className="flex gap-3">
          <BotonGuardar />
          <Link href="/facturas" className="rounded-lg border border-masa-200 px-4 py-2.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100">
            Cancelar
          </Link>
        </div>
        <p className="font-bold text-corteza-900">Total: ${montoTotal.toFixed(2)}</p>
      </div>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
