"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { crearProducto, actualizarPrecio, editarProducto, type EstadoAccion } from "./actions";

const CATEGORIAS = [
  { valor: "PAN_SAL", etiqueta: "Pan de sal" },
  { valor: "PAN_DULCE", etiqueta: "Pan de dulce" },
  { valor: "PASTELERIA", etiqueta: "Pastelería" },
  { valor: "GALLETERIA", etiqueta: "Galletería" },
  { valor: "EMPAQUETADO", etiqueta: "Empaquetado" },
];

function Mensaje({ estado }: { estado: EstadoAccion }) {
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

function BotonGuardar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-horno-500 px-4 py-3 text-touch-lg text-white hover:bg-horno-600 disabled:opacity-60"
    >
      {pending ? "Guardando…" : texto}
    </button>
  );
}

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

export function FormNuevoProducto() {
  const [estado, accion] = useFormState(crearProducto, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <form
      ref={formRef}
      action={accion}
      className="rounded-panel border border-masa-200 bg-white p-5"
    >
      <h3 className="font-bold text-corteza-900">Nuevo producto</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nombre" className="block text-sm font-semibold text-corteza-800">
            Nombre
          </label>
          <input
            id="nombre"
            name="nombre"
            required
            className={`mt-1.5 ${inputCls}`}
            placeholder="Enrollado"
          />
        </div>
        <div>
          <label htmlFor="categoria" className="block text-sm font-semibold text-corteza-800">
            Categoría
          </label>
          <select id="categoria" name="categoria" className={`mt-1.5 ${inputCls}`}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="precio" className="block text-sm font-semibold text-corteza-800">
            Precio de venta ($)
          </label>
          <input
            id="precio"
            name="precio"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            className={`mt-1.5 ${inputCls}`}
            placeholder="0.15"
          />
        </div>
        <div>
          <label htmlFor="codigoBarras" className="block text-sm font-semibold text-corteza-800">
            Código de barras <span className="font-normal text-corteza-400">(opcional)</span>
          </label>
          <input
            id="codigoBarras"
            name="codigoBarras"
            className={`mt-1.5 ${inputCls}`}
            placeholder="Para leche, avena… (futuro lector)"
          />
        </div>
        <div>
          <label htmlFor="modoProduccion" className="block text-sm font-semibold text-corteza-800">
            Modo de producción
          </label>
          <select id="modoProduccion" name="modoProduccion" defaultValue="LATAS" className={`mt-1.5 ${inputCls}`}>
            <option value="LATAS">Latas / panes por lata</option>
            <option value="UNIDADES">Unidades</option>
          </select>
        </div>
        <div>
          <label htmlFor="vidaUtilHoras" className="block text-sm font-semibold text-corteza-800">
            Vida útil (horas)
          </label>
          <input
            id="vidaUtilHoras"
            name="vidaUtilHoras"
            type="number"
            inputMode="numeric"
            min="1"
            className={`mt-1.5 ${inputCls}`}
            placeholder="24"
          />
        </div>
      </div>
      <div className="mt-5">
        <BotonGuardar texto="Agregar al catálogo" />
      </div>
      <Mensaje estado={estado} />
    </form>
  );
}

export function FormPrecio({
  productoId,
  precioActual,
}: {
  productoId: string;
  precioActual: number | null;
}) {
  const [estado, accion] = useFormState(actualizarPrecio, null);

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="productoId" value={productoId} />
      <label className="sr-only" htmlFor={`precio-${productoId}`}>
        Nuevo precio
      </label>
      <input
        id={`precio-${productoId}`}
        name="precio"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={precioActual ?? undefined}
        className="w-24 rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
      />
      <button
        type="submit"
        className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        title={estado && !estado.ok ? estado.mensaje : "Guardar nuevo precio (queda en el historial)"}
      >
        {estado?.ok ? "✓" : "Cambiar"}
      </button>
    </form>
  );
}

export function FormEditarProducto({
  productoId,
  nombreActual,
  categoriaActual,
  modoActual,
  vidaUtilActual,
}: {
  productoId: string;
  nombreActual: string;
  categoriaActual: string;
  modoActual: "LATAS" | "UNIDADES";
  vidaUtilActual: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useFormState(editarProducto, null);

  useEffect(() => {
    if (estado?.ok) setAbierto(false);
  }, [estado]);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
      >
        Editar
      </button>
    );
  }

  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="productoId" value={productoId} />
      <div>
        <label className="block text-xs font-semibold text-corteza-600">Nombre</label>
        <input
          name="nombre"
          defaultValue={nombreActual}
          required
          minLength={2}
          className="mt-1 w-40 rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2 text-sm outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-corteza-600">Categoría</label>
        <select
          name="categoria"
          defaultValue={categoriaActual}
          className="mt-1 rounded-lg border border-masa-200 bg-masa-50 px-2 py-2 text-sm outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
        >
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-corteza-600">Modo</label>
        <select
          name="modoProduccion"
          defaultValue={modoActual}
          className="mt-1 rounded-lg border border-masa-200 bg-masa-50 px-2 py-2 text-sm outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
        >
          <option value="LATAS">Latas</option>
          <option value="UNIDADES">Unidades</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-corteza-600">Vida útil</label>
        <input
          name="vidaUtilHoras"
          type="number"
          min="1"
          defaultValue={vidaUtilActual ?? ""}
          className="mt-1 w-24 rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2 text-sm outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
          placeholder="24"
        />
      </div>
      <BotonGuardar texto="Guardar" />
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="rounded-lg border border-masa-200 px-3 py-2 text-sm text-corteza-500 hover:bg-masa-100"
      >
        Cancelar
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
