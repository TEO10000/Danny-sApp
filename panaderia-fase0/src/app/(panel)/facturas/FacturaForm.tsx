"use client";

import { useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { crearFactura, type EstadoFactura } from "./actions";
import { dinero } from "@/lib/catalogo";
import type { InsumoConUltimoCosto } from "@/lib/facturas";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { normalizarDecimal } from "@/lib/decimales";
import type { TotalesImpresos } from "@/lib/decimales";

type Proveedor = { id: string; nombre: string };
type Sucursal = { id: string; nombre: string };

type LineaEstado = {
  uid: string;
  insumoId: string;
  insumoNuevoNombre: string;
  insumoNuevoUnidad: string;
  cantidad: string;
  costoTotal: string;
  descuento: string;
  tarifaIva: 0 | 15;
  costoUnitario?: number;
  confianza?: number;
};

export type ValoresInicialesFactura = {
  proveedorId?: string;
  proveedorNuevo?: { nombre: string; contacto?: string | null; telefono?: string | null };
  numero?: string | null;
  fecha?: string;
  descuentoGlobal?: number;
  ice?: number;
  irbp?: number;
  otros?: number;
  totalesImpresos?: TotalesImpresos;
  camposDudosos?: string[];
  lineas?: Array<{
    insumoId?: string;
    insumoNuevo?: { nombre: string; unidadMedida: string };
    cantidad: number;
    costoTotal: number;
    descuento?: number;
    tarifaIva?: 0 | 15 | null;
    costoUnitario?: number;
    confianza?: number;
  }>;
  origenRegistro?: "MANUAL" | "ESCANEO_IA";
  datosIaJson?: unknown;
};

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";
const inputClsAmbar =
  "w-full rounded-lg border border-yellow-400 bg-yellow-50 px-2.5 py-2.5 text-base outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/30";
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

function lineasDesdeIniciales(iniciales: ValoresInicialesFactura["lineas"]): LineaEstado[] {
  if (!iniciales || iniciales.length === 0) {
    return [{
      uid: "1", insumoId: "", insumoNuevoNombre: "", insumoNuevoUnidad: "",
      cantidad: "", costoTotal: "", descuento: "", tarifaIva: 0,
    }];
  }
  return iniciales.map((l, i) => ({
    uid: String(i + 1),
    insumoId: l.insumoId ?? (l.insumoNuevo ? "__nuevo__" : ""),
    insumoNuevoNombre: l.insumoNuevo?.nombre ?? "",
    insumoNuevoUnidad: l.insumoNuevo?.unidadMedida ?? "",
    cantidad: l.cantidad > 0 ? String(l.cantidad) : "",
    costoTotal: l.costoTotal >= 0 ? String(l.costoTotal) : "",
    descuento: l.descuento != null && l.descuento > 0 ? String(l.descuento) : "",
    tarifaIva: (l.tarifaIva === 15 ? 15 : 0) as 0 | 15,
    costoUnitario: l.costoUnitario,
    confianza: l.confianza,
  }));
}

// Cálculo V2 inline para el cliente (misma lógica que el servidor)
const r2c = (n: number) => Math.round(n * 100) / 100;

function calcV2(
  lineas: LineaEstado[],
  dGlobal: number,
  iceVal: number,
  irbpVal: number,
  otrosVal: number
) {
  const lineasCalc = lineas.map((l) => ({
    costoTotal: normalizarDecimal(l.costoTotal) ?? 0,
    tarifaIva: l.tarifaIva,
  }));
  const base15 = r2c(lineasCalc.filter((l) => l.tarifaIva === 15).reduce((s, l) => s + l.costoTotal, 0));
  const base0 = r2c(lineasCalc.filter((l) => l.tarifaIva === 0).reduce((s, l) => s + l.costoTotal, 0));

  const totalBase = base15 + base0;
  const desc15 = totalBase > 0 ? r2c(dGlobal * (base15 / totalBase)) : 0;
  const desc0 = r2c(dGlobal - desc15);
  const base15Neta = r2c(base15 - desc15);
  const base0Neta = r2c(base0 - desc0);

  const iva = r2c(base15Neta * 0.15);
  const subtotal = r2c(base0Neta + base15Neta);
  const total = r2c(subtotal + iva + iceVal + irbpVal + otrosVal);

  return { base0, base15, descuento: dGlobal, subtotal, iva, ice: iceVal, irbp: irbpVal, otros: otrosVal, total };
}

function semaforoDe(
  tv: ReturnType<typeof calcV2>,
  ti: TotalesImpresos
): "verde" | "ambar" | "rojo" | null {
  if (!ti) return null;
  const pares: Array<[number, number | null | undefined]> = [
    [tv.base0, ti.base0], [tv.base15, ti.base15], [tv.descuento, ti.descuento],
    [tv.subtotal, ti.subtotal], [tv.iva, ti.iva], [tv.ice, ti.ice],
    [tv.irbp, ti.irbp], [tv.otros, ti.otros], [tv.total, ti.total],
  ];
  let maxDif = 0;
  for (const [calc, imp] of pares) {
    if (imp != null) maxDif = Math.max(maxDif, Math.abs(calc - imp));
  }
  if (maxDif <= 0.01) return "verde";
  if (maxDif <= 0.05) return "ambar";
  return "rojo";
}

export function FacturaForm({
  proveedores,
  insumos,
  sucursales,
  hoy,
  valoresIniciales,
}: {
  proveedores: Proveedor[];
  insumos: InsumoConUltimoCosto[];
  sucursales: Sucursal[];
  hoy: string;
  valoresIniciales?: ValoresInicialesFactura;
}) {
  const initProveedorId = valoresIniciales?.proveedorId
    ? valoresIniciales.proveedorId
    : valoresIniciales?.proveedorNuevo
    ? "__nuevo__"
    : "";

  const [proveedorId, setProveedorId] = useState(initProveedorId);
  const [provNombre, setProvNombre] = useState(valoresIniciales?.proveedorNuevo?.nombre ?? "");
  const [provContacto, setProvContacto] = useState(valoresIniciales?.proveedorNuevo?.contacto ?? "");
  const [provTelefono, setProvTelefono] = useState(valoresIniciales?.proveedorNuevo?.telefono ?? "");

  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [fecha, setFecha] = useState(valoresIniciales?.fecha ?? hoy);
  const [numero, setNumero] = useState(valoresIniciales?.numero ?? "");

  // Ajustes globales
  const [descuentoGlobal, setDescuentoGlobal] = useState(
    valoresIniciales?.descuentoGlobal ? String(valoresIniciales.descuentoGlobal) : ""
  );
  const [ice, setIce] = useState(valoresIniciales?.ice ? String(valoresIniciales.ice) : "");
  const [irbp, setIrbp] = useState(valoresIniciales?.irbp ? String(valoresIniciales.irbp) : "");
  const [otros, setOtros] = useState(valoresIniciales?.otros ? String(valoresIniciales.otros) : "");

  const [masAjustesAbierto, setMasAjustesAbierto] = useState(
    (valoresIniciales?.descuentoGlobal ?? 0) > 0 ||
    (valoresIniciales?.ice ?? 0) > 0 ||
    (valoresIniciales?.irbp ?? 0) > 0 ||
    (valoresIniciales?.otros ?? 0) > 0
  );

  const lineasInicio = lineasDesdeIniciales(valoresIniciales?.lineas);
  const siguienteUid = useRef(lineasInicio.length + 1);
  const [lineas, setLineas] = useState<LineaEstado[]>(lineasInicio);

  const [estado, accion] = useFormState<EstadoFactura, FormData>(crearFactura, null);

  const origenRegistro = valoresIniciales?.origenRegistro ?? "MANUAL";
  const totalesImpresos = valoresIniciales?.totalesImpresos ?? null;
  const camposDudosos = new Set(valoresIniciales?.camposDudosos ?? []);

  const agregarLinea = () => {
    setLineas((prev) => [
      ...prev,
      {
        uid: String(siguienteUid.current++),
        insumoId: "", insumoNuevoNombre: "", insumoNuevoUnidad: "",
        cantidad: "", costoTotal: "", descuento: "", tarifaIva: 0,
      },
    ]);
  };

  const quitarLinea = (uid: string) => {
    setLineas((prev) => prev.filter((l) => l.uid !== uid));
  };

  const actualizarLinea = (uid: string, cambios: Partial<LineaEstado>) => {
    setLineas((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));
  };

  // Costo unitario mostrado en pantalla por línea
  const costoUnitarioDe = (l: LineaEstado): number | null => {
    if (l.costoUnitario != null) return l.costoUnitario;
    const qty = normalizarDecimal(l.cantidad, 3) ?? 0;
    const cost = normalizarDecimal(l.costoTotal) ?? 0;
    if (qty > 0 && cost > 0) return Math.round((cost / qty) * 100000) / 100000;
    return null;
  };

  const ultimoCostoDe = (insumoId: string): number | null =>
    insumos.find((i) => i.id === insumoId)?.ultimoCostoUnitario ?? null;

  // Líneas inconsistentes (solo cuando el scan proveyó costoUnitario independiente)
  const lineasInconsistentes = useMemo(() => {
    const result = new Set<string>();
    for (const l of lineas) {
      if (l.costoUnitario == null) continue;
      const qty = normalizarDecimal(l.cantidad, 3) ?? 0;
      const desc = normalizarDecimal(l.descuento) ?? 0;
      const ct = normalizarDecimal(l.costoTotal) ?? 0;
      if (qty > 0 && Math.abs(qty * l.costoUnitario - desc - ct) > 0.02) {
        result.add(l.uid);
      }
    }
    return result;
  }, [lineas]);

  // Totales V2 en vivo
  const tv = useMemo(() => {
    return calcV2(
      lineas,
      normalizarDecimal(descuentoGlobal) ?? 0,
      normalizarDecimal(ice) ?? 0,
      normalizarDecimal(irbp) ?? 0,
      normalizarDecimal(otros) ?? 0
    );
  }, [lineas, descuentoGlobal, ice, irbp, otros]);

  const semaforo = useMemo(() => semaforoDe(tv, totalesImpresos), [tv, totalesImpresos]);

  // Validación
  const puedeGuardar = useMemo(() => {
    if (!sucursalId || !fecha || !proveedorId) return false;
    if (proveedorId === "__nuevo__" && !provNombre.trim()) return false;
    if (lineas.length === 0) return false;
    for (const l of lineas) {
      if (!l.insumoId) return false;
      if (l.insumoId === "__nuevo__" && (!l.insumoNuevoNombre.trim() || !l.insumoNuevoUnidad.trim())) return false;
      const qty = normalizarDecimal(l.cantidad, 3) ?? 0;
      const costoTotalStr = l.costoTotal.trim();
      const cost = normalizarDecimal(costoTotalStr);
      if (!(qty > 0) || costoTotalStr === "" || cost === null || cost < 0) return false;
    }
    return true;
  }, [sucursalId, fecha, proveedorId, provNombre, lineas]);

  // Clases de input: ámbar si campo es dudoso según IA
  const inputClsPorCampo = (campo: string) =>
    camposDudosos.has(campo) ? inputClsAmbar : inputCls;

  const esLineaDudosa = (l: LineaEstado) =>
    (l.confianza != null && l.confianza < 0.7) || lineasInconsistentes.has(l.uid);

  // Payload
  const payload = JSON.stringify({
    proveedorId: proveedorId !== "__nuevo__" ? proveedorId : undefined,
    proveedorNuevo:
      proveedorId === "__nuevo__"
        ? { nombre: provNombre.trim(), contacto: provContacto.trim() || null, telefono: provTelefono.trim() || null }
        : undefined,
    sucursalId,
    fecha,
    numero: numero.trim() || null,
    descuentoGlobal: normalizarDecimal(descuentoGlobal) ?? 0,
    ice: normalizarDecimal(ice) ?? 0,
    irbp: normalizarDecimal(irbp) ?? 0,
    otros: normalizarDecimal(otros) ?? 0,
    lineas: lineas.map((l) => ({
      insumoId: l.insumoId !== "__nuevo__" ? l.insumoId || undefined : undefined,
      insumoNuevo:
        l.insumoId === "__nuevo__"
          ? { nombre: l.insumoNuevoNombre.trim(), unidadMedida: l.insumoNuevoUnidad.trim() }
          : undefined,
      cantidad: normalizarDecimal(l.cantidad, 3) ?? 0,
      costoTotal: normalizarDecimal(l.costoTotal) ?? 0,
      descuento: normalizarDecimal(l.descuento) ?? 0,
      tarifaIva: l.tarifaIva,
      costoUnitario: l.costoUnitario,
    })),
    origenRegistro,
    datosIaJson: valoresIniciales?.datosIaJson ?? undefined,
  });

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />

      {/* Banner IA */}
      {origenRegistro === "ESCANEO_IA" && (
        <div className="rounded-lg border border-horno-400 bg-horno-500/10 px-4 py-3 text-sm text-horno-700">
          Datos pre-llenados por la IA. Verifica cada campo antes de guardar.
          {camposDudosos.size > 0 && (
            <span className="ml-1 font-semibold">
              Campos resaltados en amarillo necesitan revisión.
            </span>
          )}
        </div>
      )}

      {/* Proveedor */}
      <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-4">
        <h3 className="font-bold text-corteza-900">Proveedor</h3>
        <div>
          <label className={labelCls}>Proveedor</label>
          <div className="mt-1.5">
            <SelectorBuscador
              name="proveedor-sel"
              opciones={[
                ...proveedores.map((p) => ({ id: p.id, etiqueta: p.nombre })),
                { id: "__nuevo__", etiqueta: "+ Proveedor nuevo…" },
              ]}
              valorInicial={initProveedorId}
              placeholder="Buscar proveedor…"
              onSeleccion={setProveedorId}
              requerido
            />
          </div>
        </div>

        {proveedorId === "__nuevo__" && (
          <div className="grid gap-3 rounded-lg bg-masa-50 p-3 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Nombre <span className="font-normal text-cuadre-mal">*</span></label>
              <input type="text" value={provNombre} onChange={(e) => setProvNombre(e.target.value)}
                placeholder="Distribuidora…" className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Contacto</label>
              <input type="text" value={provContacto} onChange={(e) => setProvContacto(e.target.value)}
                placeholder="Juan Pérez" className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input type="tel" value={provTelefono} onChange={(e) => setProvTelefono(e.target.value)}
                placeholder="0991234567" className={`mt-1 ${inputCls}`} />
            </div>
          </div>
        )}
      </section>

      {/* Datos de la factura */}
      <section className="rounded-panel border border-masa-200 bg-white p-5">
        <h3 className="font-bold text-corteza-900">Datos de la factura</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="sucursal" className={labelCls}>Sucursal que recibe</label>
            <select id="sucursal" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={`mt-1.5 ${inputCls}`}>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="fecha-fact" className={labelCls}>Fecha de la factura</label>
            <input id="fecha-fact" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className={`mt-1.5 ${inputClsPorCampo("fecha")}`} />
          </div>
          <div>
            <label htmlFor="numero" className={labelCls}>N.º de factura <span className="font-normal text-corteza-400">(opcional)</span></label>
            <input id="numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)}
              placeholder="001-001-000000123" className={`mt-1.5 ${inputClsPorCampo("numero")}`} />
          </div>
        </div>

        {/* Más ajustes (descuento global, ICE, IRBP, Otros) */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMasAjustesAbierto((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-corteza-600 hover:text-horno-600"
          >
            <span className={`transition-transform ${masAjustesAbierto ? "rotate-90" : ""}`}>▶</span>
            Más ajustes de la factura
          </button>

          {masAjustesAbierto && (
            <div className="mt-3 grid gap-3 rounded-lg bg-masa-50 p-4 sm:grid-cols-4">
              <div>
                <label className={labelCls}>Desc. global ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={descuentoGlobal} onChange={(e) => setDescuentoGlobal(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className={labelCls}>ICE ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={ice} onChange={(e) => setIce(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className={labelCls}>I.R.B.P. ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={irbp} onChange={(e) => setIrbp(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
              <div>
                <label className={labelCls}>Otros cargos ($)</label>
                <input type="text" inputMode="decimal" autoComplete="off"
                  value={otros} onChange={(e) => setOtros(e.target.value)}
                  placeholder="0.00" className={`mt-1 ${inputCls}`} />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Líneas de insumos */}
      <section className="rounded-panel border border-masa-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-masa-200 bg-masa-50 px-4 py-2.5">
          <h3 className="font-bold text-corteza-900">Insumos comprados</h3>
          <button type="button" onClick={agregarLinea}
            className="rounded-lg border border-horno-500 px-3 py-1.5 text-sm font-semibold text-horno-600 hover:bg-horno-500/10">
            + Agregar línea
          </button>
        </div>

        {lineas.length === 0 && (
          <p className="px-4 py-6 text-sm text-corteza-400">No hay líneas. Usa el botón para agregar insumos.</p>
        )}

        <ul className="divide-y divide-masa-100">
          {lineas.map((l) => {
            const cu = costoUnitarioDe(l);
            const ref = ultimoCostoDe(l.insumoId);
            const dudosa = esLineaDudosa(l);
            return (
              <li key={l.uid} className={`space-y-3 p-4 ${dudosa ? "bg-yellow-50" : ""}`}>
                {/* Insumo + quitar */}
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div>
                    <label className={labelCls}>Insumo</label>
                    <div className="mt-1">
                      <SelectorBuscador
                        name={`insumo-sel-${l.uid}`}
                        opciones={[
                          ...insumos.map((i) => ({
                            id: i.id,
                            etiqueta: `${i.nombre} (${i.unidadMedida})`,
                            detalle: i.ultimoCostoUnitario != null ? `Último: ${dinero(i.ultimoCostoUnitario)}` : undefined,
                          })),
                          { id: "__nuevo__", etiqueta: "+ Insumo nuevo…" },
                        ]}
                        valorInicial={l.insumoId}
                        placeholder="Buscar insumo…"
                        onSeleccion={(id) => actualizarLinea(l.uid, { insumoId: id, insumoNuevoNombre: "", insumoNuevoUnidad: "" })}
                        requerido
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={() => quitarLinea(l.uid)}
                      className="rounded-lg border border-masa-200 px-3 py-2.5 text-sm text-corteza-400 hover:bg-cuadre-mal/10 hover:text-cuadre-mal">
                      Quitar
                    </button>
                  </div>
                </div>

                {l.insumoId === "__nuevo__" && (
                  <div className="grid gap-3 rounded-lg bg-masa-50 p-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Nombre del insumo <span className="font-normal text-cuadre-mal">*</span></label>
                      <input type="text" value={l.insumoNuevoNombre}
                        onChange={(e) => actualizarLinea(l.uid, { insumoNuevoNombre: e.target.value })}
                        placeholder="Harina de trigo" className={`mt-1 ${inputCls}`} />
                    </div>
                    <div>
                      <label className={labelCls}>Unidad de medida <span className="font-normal text-cuadre-mal">*</span></label>
                      <input type="text" value={l.insumoNuevoUnidad}
                        onChange={(e) => actualizarLinea(l.uid, { insumoNuevoUnidad: e.target.value })}
                        placeholder="quintal, kg, litro…" className={`mt-1 ${inputCls}`} />
                    </div>
                  </div>
                )}

                {/* Campos numéricos + tarifa */}
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className={labelCls}>Cantidad</label>
                    <input type="text" inputMode="decimal" autoComplete="off"
                      value={l.cantidad} onChange={(e) => actualizarLinea(l.uid, { cantidad: e.target.value, costoUnitario: undefined })}
                      placeholder="0" className={`mt-1 ${dudosa ? inputClsAmbar : inputCls}`} />
                  </div>
                  <div>
                    <label className={labelCls}>Desc. ($)</label>
                    <input type="text" inputMode="decimal" autoComplete="off"
                      value={l.descuento} onChange={(e) => actualizarLinea(l.uid, { descuento: e.target.value })}
                      placeholder="0.00" className={`mt-1 ${inputCls}`} />
                  </div>
                  <div>
                    <label className={labelCls}>Valor total ($)</label>
                    <input type="text" inputMode="decimal" autoComplete="off"
                      value={l.costoTotal} onChange={(e) => actualizarLinea(l.uid, { costoTotal: e.target.value, costoUnitario: undefined })}
                      placeholder="0.00" className={`mt-1 ${dudosa ? inputClsAmbar : inputCls}`} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>IVA</label>
                    <div className="flex overflow-hidden rounded-lg border border-masa-200 mt-1">
                      <button
                        type="button"
                        onClick={() => actualizarLinea(l.uid, { tarifaIva: 0 })}
                        className={`flex-1 min-h-[44px] py-2 text-sm font-semibold transition-colors ${
                          l.tarifaIva === 0 ? "bg-horno-500 text-white" : "bg-white text-corteza-600 hover:bg-masa-100"
                        }`}
                      >
                        0%
                      </button>
                      <button
                        type="button"
                        onClick={() => actualizarLinea(l.uid, { tarifaIva: 15 })}
                        className={`flex-1 min-h-[44px] py-2 text-sm font-semibold transition-colors border-l border-masa-200 ${
                          l.tarifaIva === 15 ? "bg-horno-500 text-white" : "bg-white text-corteza-600 hover:bg-masa-100"
                        }`}
                      >
                        15%
                      </button>
                    </div>
                  </div>
                </div>

                {/* Costo unitario */}
                <div className="flex items-center gap-3">
                  <p className="text-xs text-corteza-400">
                    Costo unitario:{" "}
                    <span className="font-semibold text-corteza-700">{cu !== null ? dinero(cu) : "—"}</span>
                  </p>
                  {ref !== null && l.insumoId && l.insumoId !== "__nuevo__" && (
                    <p className="text-xs text-corteza-400">· Último pagado: {dinero(ref)}</p>
                  )}
                  {lineasInconsistentes.has(l.uid) && (
                    <p className="text-xs font-semibold text-cuadre-mal">Revisa: valor no cuadra con cantidad × precio</p>
                  )}
                  {l.confianza != null && l.confianza < 0.7 && (
                    <p className="text-xs font-semibold text-yellow-700">Confianza baja — verifica</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Bloque de totales en vivo */}
        {lineas.length > 0 && (
          <div className="border-t border-masa-200 bg-masa-50 px-4 py-3 space-y-1">
            {/* Semáforo */}
            {semaforo && (
              <div className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                semaforo === "verde" ? "bg-cuadre-ok/10 text-cuadre-ok" :
                semaforo === "ambar" ? "bg-yellow-100 text-yellow-800" :
                "bg-cuadre-mal/10 text-cuadre-mal"
              }`}>
                <span>{semaforo === "verde" ? "●" : semaforo === "ambar" ? "●" : "●"}</span>
                {semaforo === "verde" && "Totales cuadran con la factura impresa"}
                {semaforo === "ambar" && "Diferencia mínima de centavos (aceptable)"}
                {semaforo === "rojo" && "Revisa las líneas marcadas — descuadre mayor a $0.05"}
              </div>
            )}

            {tv.base0 > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-corteza-500">Base 0%:</span>
                <span className="text-sm font-semibold text-corteza-700">{dinero(tv.base0)}</span>
              </div>
            )}
            {tv.base15 > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-corteza-500">Base 15%:</span>
                <span className="text-sm font-semibold text-corteza-700">{dinero(tv.base15)}</span>
              </div>
            )}
            {tv.descuento > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-corteza-500">Desc. global:</span>
                <span className="text-sm font-semibold text-corteza-700">− {dinero(tv.descuento)}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-corteza-600">Subtotal:</span>
              <span className="text-base font-semibold text-corteza-900">{dinero(tv.subtotal)}</span>
            </div>
            {tv.iva > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-corteza-600">IVA 15%:</span>
                <span className="text-base font-semibold text-corteza-900">{dinero(tv.iva)}</span>
              </div>
            )}
            {tv.ice > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-corteza-500">ICE:</span>
                <span className="text-sm font-semibold text-corteza-700">{dinero(tv.ice)}</span>
              </div>
            )}
            {tv.irbp > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-corteza-500">I.R.B.P.:</span>
                <span className="text-sm font-semibold text-corteza-700">{dinero(tv.irbp)}</span>
              </div>
            )}
            {tv.otros > 0 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-corteza-500">Otros:</span>
                <span className="text-sm font-semibold text-corteza-700">{dinero(tv.otros)}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-masa-200 pt-1">
              <span className="text-sm font-semibold text-corteza-700">Total:</span>
              <span className="text-lg font-bold text-corteza-900">{dinero(tv.total)}</span>
            </div>
          </div>
        )}
      </section>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          {estado.mensaje}
        </p>
      )}

      <BotonGuardar disabled={!puedeGuardar} />
    </form>
  );
}
