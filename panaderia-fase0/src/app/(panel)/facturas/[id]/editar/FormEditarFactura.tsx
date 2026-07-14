"use client";

import { useState, useMemo } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { editarFactura, type EstadoFactura } from "../../actions";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { normalizarDecimal } from "@/lib/decimales";
import { dinero } from "@/lib/catalogo";

type Proveedor = { id: string; nombre: string };
type Sucursal = { id: string; nombre: string };
type Insumo = { id: string; nombre: string; unidadMedida: string };
type LineaInicial = {
  insumoId: string;
  insumoNombre: string;
  cantidad: number;
  costoTotal: number;
  tarifaIva: 0 | 15;
  descuento: number;
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";
const labelCls = "block text-xs font-semibold text-corteza-600";

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600 disabled:opacity-60">
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function calcTotales(
  lineas: Array<{ costoTotal: string; tarifaIva: 0 | 15 }>,
  dGlobal: number,
  iceVal: number,
  irbpVal: number,
  otrosVal: number
) {
  const base15 = r2(lineas.filter((l) => l.tarifaIva === 15).reduce((s, l) => s + (normalizarDecimal(l.costoTotal) ?? 0), 0));
  const base0 = r2(lineas.filter((l) => l.tarifaIva === 0).reduce((s, l) => s + (normalizarDecimal(l.costoTotal) ?? 0), 0));
  const totalBase = base15 + base0;
  const desc15 = totalBase > 0 ? r2(dGlobal * (base15 / totalBase)) : 0;
  const desc0 = r2(dGlobal - desc15);
  const base15Neta = r2(base15 - desc15);
  const base0Neta = r2(base0 - desc0);
  const iva = r2(base15Neta * 0.15);
  const subtotal = r2(base0Neta + base15Neta);
  const total = r2(subtotal + iva + iceVal + irbpVal + otrosVal);
  return { base0, base15, iva, subtotal, total };
}

export function FormEditarFactura({
  facturaId,
  initialProveedorId,
  initialSucursalId,
  initialFecha,
  initialNumero,
  initialLineas,
  initialDescuentoGlobal,
  initialIce,
  initialIrbp,
  initialOtros,
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
  initialDescuentoGlobal: number;
  initialIce: number;
  initialIrbp: number;
  initialOtros: number;
  proveedores: Proveedor[];
  sucursales: Sucursal[];
  insumos: Insumo[];
}) {
  const [proveedorId, setProveedorId] = useState(initialProveedorId);
  const [lineas, setLineas] = useState(
    initialLineas.map((l, i) => ({
      clave: i,
      ...l,
      cantidad: String(l.cantidad),
      costoTotal: String(l.costoTotal),
      descuento: l.descuento > 0 ? String(l.descuento) : "",
    }))
  );

  const [descuentoGlobal, setDescuentoGlobal] = useState(initialDescuentoGlobal > 0 ? String(initialDescuentoGlobal) : "");
  const [ice, setIce] = useState(initialIce > 0 ? String(initialIce) : "");
  const [irbp, setIrbp] = useState(initialIrbp > 0 ? String(initialIrbp) : "");
  const [otros, setOtros] = useState(initialOtros > 0 ? String(initialOtros) : "");
  const [masAjustesAbierto, setMasAjustesAbierto] = useState(
    initialDescuentoGlobal > 0 || initialIce > 0 || initialIrbp > 0 || initialOtros > 0
  );

  const [estado, accion] = useFormState<EstadoFactura, FormData>(editarFactura, null);

  const editarLinea = (clave: number, campo: string, valor: string | number) => {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));
  };

  const { base0, base15, iva, subtotal, total } = useMemo(() =>
    calcTotales(
      lineas,
      normalizarDecimal(descuentoGlobal) ?? 0,
      normalizarDecimal(ice) ?? 0,
      normalizarDecimal(irbp) ?? 0,
      normalizarDecimal(otros) ?? 0
    ),
    [lineas, descuentoGlobal, ice, irbp, otros]
  );

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        const payloadInput = e.currentTarget.elements.namedItem("payload") as HTMLInputElement;
        const sucursalEl = e.currentTarget.elements.namedItem("sucursalId") as HTMLSelectElement;
        const fechaEl = e.currentTarget.elements.namedItem("fecha") as HTMLInputElement;
        const numeroEl = e.currentTarget.elements.namedItem("numero") as HTMLInputElement;
        const payload = {
          id: facturaId,
          proveedorId,
          sucursalId: sucursalEl?.value ?? initialSucursalId,
          fecha: fechaEl?.value ?? initialFecha,
          numero: numeroEl?.value ?? "",
          descuentoGlobal: normalizarDecimal(descuentoGlobal) ?? 0,
          ice: normalizarDecimal(ice) ?? 0,
          irbp: normalizarDecimal(irbp) ?? 0,
          otros: normalizarDecimal(otros) ?? 0,
          lineas: lineas.map((l) => ({
            insumoId: l.insumoId,
            cantidad: normalizarDecimal(l.cantidad, 3) ?? 0,
            costoTotal: normalizarDecimal(l.costoTotal) ?? 0,
            descuento: normalizarDecimal(l.descuento) ?? 0,
            tarifaIva: l.tarifaIva,
          })),
        };
        payloadInput.value = JSON.stringify(payload);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="payload" defaultValue="" />

      <div className="grid gap-4 rounded-panel border border-masa-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold text-corteza-800">Proveedor</label>
          <div className="mt-1.5">
            <SelectorBuscador
              name="proveedorId-hidden"
              opciones={proveedores.map((p) => ({ id: p.id, etiqueta: p.nombre }))}
              valorInicial={initialProveedorId}
              placeholder="Buscar proveedor…"
              onSeleccion={setProveedorId}
              requerido
            />
          </div>
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

        {/* Más ajustes */}
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setMasAjustesAbierto((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-corteza-600 hover:text-horno-600"
          >
            <span className={`transition-transform ${masAjustesAbierto ? "rotate-90" : ""}`}>▶</span>
            Más ajustes de la factura
          </button>
          {masAjustesAbierto && (
            <div className="mt-3 grid gap-3 rounded-lg bg-masa-50 p-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-corteza-600">Desc. global ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={descuentoGlobal} onChange={(e) => setDescuentoGlobal(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-corteza-600">ICE ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={ice} onChange={(e) => setIce(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-corteza-600">I.R.B.P. ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={irbp} onChange={(e) => setIrbp(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-corteza-600">Otros cargos ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={otros} onChange={(e) => setOtros(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Líneas */}
      <section className="space-y-3">
        <h3 className="font-bold text-corteza-900">Líneas de compra</h3>
        {lineas.map((l, idx) => (
          <div key={l.clave} className="rounded-panel border border-masa-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-corteza-400">Línea {idx + 1}</span>
              {lineas.length > 1 && (
                <button type="button"
                  onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                  className="text-sm font-semibold text-cuadre-mal hover:bg-cuadre-mal/10 rounded-lg px-2 py-1">
                  Quitar
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <div>
                <label className={labelCls}>Insumo</label>
                <div className="mt-1">
                  <SelectorBuscador
                    name={`insumo-sel-${l.clave}`}
                    opciones={insumos.map((i) => ({ id: i.id, etiqueta: `${i.nombre} (${i.unidadMedida})` }))}
                    valorInicial={l.insumoId}
                    placeholder="Buscar insumo…"
                    onSeleccion={(id) => editarLinea(l.clave, "insumoId", id)}
                    requerido
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Cantidad</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={l.cantidad} onChange={(e) => editarLinea(l.clave, "cantidad", e.target.value)}
                  required className={`mt-1 ${inputCls}`} placeholder="0.000" />
              </div>
              <div>
                <label className={labelCls}>Desc. ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={l.descuento} onChange={(e) => editarLinea(l.clave, "descuento", e.target.value)}
                  className={`mt-1 ${inputCls}`} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Valor total ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={l.costoTotal} onChange={(e) => editarLinea(l.clave, "costoTotal", e.target.value)}
                  required className={`mt-1 ${inputCls}`} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>IVA</label>
                <div className="flex overflow-hidden rounded-lg border border-masa-200 mt-1">
                  <button type="button"
                    onClick={() => editarLinea(l.clave, "tarifaIva", 0)}
                    className={`flex-1 min-h-[44px] px-2 text-sm font-semibold transition-colors ${
                      l.tarifaIva === 0 ? "bg-horno-500 text-white" : "bg-white text-corteza-600 hover:bg-masa-100"
                    }`}>0%</button>
                  <button type="button"
                    onClick={() => editarLinea(l.clave, "tarifaIva", 15)}
                    className={`flex-1 min-h-[44px] px-2 text-sm font-semibold transition-colors border-l border-masa-200 ${
                      l.tarifaIva === 15 ? "bg-horno-500 text-white" : "bg-white text-corteza-600 hover:bg-masa-100"
                    }`}>15%</button>
                </div>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLineas((ls) => [...ls, { clave: Date.now(), insumoId: "", insumoNombre: "", cantidad: "", costoTotal: "", descuento: "", tarifaIva: 0 }])}
          className="w-full rounded-panel border-2 border-dashed border-masa-200 px-4 py-3 font-semibold text-corteza-600 hover:border-horno-400 hover:text-horno-600">
          + Agregar línea
        </button>
      </section>

      {/* Totales en vivo */}
      <div className="rounded-panel border border-masa-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-3">
            <BotonGuardar />
            <Link href="/facturas" className="rounded-lg border border-masa-200 px-4 py-2.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100">
              Cancelar
            </Link>
          </div>
          <div className="text-right space-y-0.5 text-sm">
            {base0 > 0 && <p className="text-corteza-500">Base 0%: {dinero(base0)}</p>}
            {base15 > 0 && <p className="text-corteza-500">Base 15%: {dinero(base15)}</p>}
            {iva > 0 && <p className="text-corteza-500">Subtotal {dinero(subtotal)} + IVA {dinero(iva)}</p>}
            <p className="font-bold text-corteza-900">Total: {dinero(total)}</p>
          </div>
        </div>
      </div>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
