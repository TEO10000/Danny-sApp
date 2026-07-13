"use client";

import { useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { crearFactura, type EstadoFactura } from "./actions";
import { dinero } from "@/lib/catalogo";
import type { InsumoConUltimoCosto } from "@/lib/facturas";
import { SelectorBuscador } from "@/components/SelectorBuscador";
import { normalizarDecimal } from "@/lib/decimales";

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

// Props opcionales para pre-llenar el formulario desde un escaneo IA
export type ValoresInicialesFactura = {
  proveedorId?: string;
  proveedorNuevo?: { nombre: string; contacto?: string | null; telefono?: string | null };
  numero?: string | null;
  fecha?: string;
  aplicaIva?: boolean;
  advertenciaDescuadre?: string;
  lineas?: Array<{
    insumoId?: string;
    insumoNuevo?: { nombre: string; unidadMedida: string };
    cantidad: number;
    costoTotal: number;
  }>;
  origenRegistro?: "MANUAL" | "ESCANEO_IA";
  datosIaJson?: unknown;
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

function lineasDesdeIniciales(
  iniciales: ValoresInicialesFactura["lineas"]
): LineaEstado[] {
  if (!iniciales || iniciales.length === 0) {
    return [
      {
        uid: "1",
        insumoId: "",
        insumoNuevoNombre: "",
        insumoNuevoUnidad: "",
        cantidad: "",
        costoTotal: "",
      },
    ];
  }
  return iniciales.map((l, i) => ({
    uid: String(i + 1),
    insumoId: l.insumoId ?? (l.insumoNuevo ? "__nuevo__" : ""),
    insumoNuevoNombre: l.insumoNuevo?.nombre ?? "",
    insumoNuevoUnidad: l.insumoNuevo?.unidadMedida ?? "",
    cantidad: l.cantidad > 0 ? String(l.cantidad) : "",
    costoTotal: l.costoTotal > 0 ? String(l.costoTotal) : "",
  }));
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
  // Determinar ID de proveedor inicial
  const initProveedorId = valoresIniciales?.proveedorId
    ? valoresIniciales.proveedorId
    : valoresIniciales?.proveedorNuevo
    ? "__nuevo__"
    : "";

  // Estado del proveedor
  const [proveedorId, setProveedorId] = useState(initProveedorId);
  const [provNombre, setProvNombre] = useState(
    valoresIniciales?.proveedorNuevo?.nombre ?? ""
  );
  const [provContacto, setProvContacto] = useState(
    valoresIniciales?.proveedorNuevo?.contacto ?? ""
  );
  const [provTelefono, setProvTelefono] = useState(
    valoresIniciales?.proveedorNuevo?.telefono ?? ""
  );

  // Metadatos de la factura
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? "");
  const [fecha, setFecha] = useState(valoresIniciales?.fecha ?? hoy);
  const [numero, setNumero] = useState(valoresIniciales?.numero ?? "");
  const [aplicaIva, setAplicaIva] = useState(valoresIniciales?.aplicaIva ?? false);

  // Líneas de compra
  const lineasInicio = lineasDesdeIniciales(valoresIniciales?.lineas);
  const siguienteUid = useRef(lineasInicio.length + 1);
  const [lineas, setLineas] = useState<LineaEstado[]>(lineasInicio);

  const [estado, accion] = useFormState<EstadoFactura, FormData>(crearFactura, null);

  const origenRegistro = valoresIniciales?.origenRegistro ?? "MANUAL";

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
    const qty = normalizarDecimal(l.cantidad, 3) ?? 0;
    const cost = normalizarDecimal(l.costoTotal) ?? 0;
    if (qty > 0 && cost > 0) return Math.round((cost / qty) * 10000) / 10000;
    return null;
  };

  // Último costo de referencia para el insumo elegido
  const ultimoCostoDe = (insumoId: string): number | null => {
    return insumos.find((i) => i.id === insumoId)?.ultimoCostoUnitario ?? null;
  };

  // Totales en vivo (misma lógica que el servidor)
  const { subtotalVivo, ivaVivo, totalVivo } = useMemo(() => {
    const subtotalVivo = Math.round(
      lineas.reduce((sum, l) => {
        const c = normalizarDecimal(l.costoTotal) ?? 0;
        return sum + c;
      }, 0) * 100
    ) / 100;
    const ivaVivo = aplicaIva ? Math.round(subtotalVivo * 0.15 * 100) / 100 : 0;
    const totalVivo = Math.round((subtotalVivo + ivaVivo) * 100) / 100;
    return { subtotalVivo, ivaVivo, totalVivo };
  }, [lineas, aplicaIva]);

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
      const qty = normalizarDecimal(l.cantidad, 3) ?? 0;
      const cost = normalizarDecimal(l.costoTotal) ?? 0;
      if (!(qty > 0) || !(cost > 0)) return false;
    }
    return true;
  }, [sucursalId, fecha, proveedorId, provNombre, lineas]);

  // Advertencia de descuadre del escaneo IA
  const advertenciaDescuadre = valoresIniciales?.advertenciaDescuadre;

  // Serialización del payload
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
    aplicaIva,
    lineas: lineas.map((l) => ({
      insumoId: l.insumoId !== "__nuevo__" ? l.insumoId || undefined : undefined,
      insumoNuevo:
        l.insumoId === "__nuevo__"
          ? { nombre: l.insumoNuevoNombre.trim(), unidadMedida: l.insumoNuevoUnidad.trim() }
          : undefined,
      cantidad: normalizarDecimal(l.cantidad, 3) ?? 0,
      costoTotal: normalizarDecimal(l.costoTotal) ?? 0,
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
          Datos pre-llenados por la IA. Verifica el monto de cada línea, elige la sucursal
          correcta y corrige cualquier campo antes de guardar.
        </div>
      )}

      {/* Advertencia de descuadre del escaneo IA */}
      {advertenciaDescuadre && (
        <div role="alert" className="rounded-lg border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {advertenciaDescuadre}
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

        {/* Checkbox IVA */}
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-masa-200 bg-masa-50 px-4 py-2.5 select-none">
          <input
            type="checkbox"
            checked={aplicaIva}
            onChange={(e) => setAplicaIva(e.target.checked)}
            className="h-5 w-5 rounded accent-horno-500"
          />
          <span className="text-sm font-semibold text-corteza-800">
            Factura con IVA (15%)
          </span>
        </label>
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
                    <div className="mt-1">
                      <SelectorBuscador
                        name={`insumo-sel-${l.uid}`}
                        opciones={[
                          ...insumos.map((i) => ({
                            id: i.id,
                            etiqueta: `${i.nombre} (${i.unidadMedida})`,
                            detalle:
                              i.ultimoCostoUnitario != null
                                ? `Último: ${dinero(i.ultimoCostoUnitario)}`
                                : undefined,
                          })),
                          { id: "__nuevo__", etiqueta: "+ Insumo nuevo…" },
                        ]}
                        valorInicial={l.insumoId}
                        placeholder="Buscar insumo…"
                        onSeleccion={(id) =>
                          actualizarLinea(l.uid, {
                            insumoId: id,
                            insumoNuevoNombre: "",
                            insumoNuevoUnidad: "",
                          })
                        }
                        requerido
                      />
                    </div>
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
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={l.cantidad}
                      onChange={(e) => actualizarLinea(l.uid, { cantidad: e.target.value })}
                      placeholder="0"
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Costo total ($)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
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
          <div className="border-t border-masa-200 bg-masa-50 px-4 py-3 space-y-1">
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-corteza-600">Subtotal:</span>
              <span className="text-base font-semibold text-corteza-900">{dinero(subtotalVivo)}</span>
            </div>
            {aplicaIva && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-corteza-600">IVA 15%:</span>
                <span className="text-base font-semibold text-corteza-900">{dinero(ivaVivo)}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-masa-200 pt-1">
              <span className="text-sm font-semibold text-corteza-700">Total:</span>
              <span className="text-lg font-bold text-corteza-900">{dinero(totalVivo)}</span>
            </div>
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
