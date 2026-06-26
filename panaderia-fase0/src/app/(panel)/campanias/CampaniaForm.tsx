"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { ProductoConPrecio } from "@/lib/catalogo";
import { crearCampania, editarCampania, eliminarCampania } from "./actions";

const SchemaCampaniaCliente = z
  .object({
    nombre: z.string().min(1, "El nombre es requerido."),
    descripcion: z.string().optional(),
    fechaInicio: z.string().min(1, "La fecha de inicio es requerida."),
    fechaFin: z.string().min(1, "La fecha de fin es requerida."),
    costo: z.coerce.number().min(0, "El costo no puede ser negativo."),
    sucursalId: z.string().nullable(),
    productosIds: z.array(z.string()).min(1, "Selecciona al menos un producto."),
  })
  .refine((d) => d.fechaInicio <= d.fechaFin, {
    message: "La fecha de inicio no puede ser posterior a la de fin.",
    path: ["fechaFin"],
  });

type Errores = Partial<Record<string, string>>;

type Props = {
  sucursales: Array<{ id: string; nombre: string }>;
  productos: ProductoConPrecio[];
  inicial?: {
    id: string;
    nombre: string;
    descripcion: string | null;
    fechaInicio: string;
    fechaFin: string;
    costo: number;
    sucursalId: string | null;
    productosIds: string[];
  };
};

export function CampaniaForm({ sucursales, productos, inicial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errores, setErrores] = useState<Errores>({});
  const [errorGlobal, setErrorGlobal] = useState("");
  const [confirmEliminar, setConfirmEliminar] = useState(false);

  const nombreRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLTextAreaElement>(null);
  const fechaInicioRef = useRef<HTMLInputElement>(null);
  const fechaFinRef = useRef<HTMLInputElement>(null);
  const costoRef = useRef<HTMLInputElement>(null);
  const sucursalRef = useRef<HTMLSelectElement>(null);
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>(
    inicial?.productosIds ?? []
  );

  function toggleProducto(id: string) {
    setProductosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setErrorGlobal("");

    const datos = {
      nombre: nombreRef.current?.value ?? "",
      descripcion: descripcionRef.current?.value ?? "",
      fechaInicio: fechaInicioRef.current?.value ?? "",
      fechaFin: fechaFinRef.current?.value ?? "",
      costo: costoRef.current?.value ?? "0",
      sucursalId: sucursalRef.current?.value || null,
      productosIds: productosSeleccionados,
    };

    const parsed = SchemaCampaniaCliente.safeParse(datos);
    if (!parsed.success) {
      const mapa: Errores = {};
      for (const err of parsed.error.errors) {
        const campo = err.path[0] as string;
        if (!mapa[campo]) mapa[campo] = err.message;
      }
      setErrores(mapa);
      return;
    }

    const fd = new FormData();
    fd.set("payload", JSON.stringify(parsed.data));

    startTransition(async () => {
      const resultado = inicial
        ? await editarCampania(inicial.id, fd)
        : await crearCampania(fd);

      if (resultado.ok) {
        router.push("/campanias");
        router.refresh();
      } else {
        setErrorGlobal(resultado.error);
      }
    });
  }

  function handleEliminar() {
    if (!inicial) return;
    startTransition(async () => {
      const resultado = await eliminarCampania(inicial.id);
      if (resultado.ok) {
        router.push("/campanias");
        router.refresh();
      } else {
        setErrorGlobal(resultado.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {errorGlobal && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2 text-sm font-medium text-cuadre-mal">
          {errorGlobal}
        </p>
      )}

      {/* Nombre */}
      <div>
        <label className="block text-sm font-semibold text-corteza-700 mb-1">
          Nombre <span className="text-cuadre-mal">*</span>
        </label>
        <input
          ref={nombreRef}
          defaultValue={inicial?.nombre ?? ""}
          className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm"
          placeholder="Ej. Campaña de Navidad"
        />
        {errores.nombre && <p className="mt-1 text-xs text-cuadre-mal">{errores.nombre}</p>}
      </div>

      {/* Descripción */}
      <div>
        <label className="block text-sm font-semibold text-corteza-700 mb-1">
          Descripción
        </label>
        <textarea
          ref={descripcionRef}
          defaultValue={inicial?.descripcion ?? ""}
          rows={3}
          className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm"
          placeholder="Describe la campaña..."
        />
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-corteza-700 mb-1">
            Fecha inicio <span className="text-cuadre-mal">*</span>
          </label>
          <input
            ref={fechaInicioRef}
            type="date"
            defaultValue={inicial?.fechaInicio ?? ""}
            className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm"
          />
          {errores.fechaInicio && (
            <p className="mt-1 text-xs text-cuadre-mal">{errores.fechaInicio}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-corteza-700 mb-1">
            Fecha fin <span className="text-cuadre-mal">*</span>
          </label>
          <input
            ref={fechaFinRef}
            type="date"
            defaultValue={inicial?.fechaFin ?? ""}
            className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm"
          />
          {errores.fechaFin && (
            <p className="mt-1 text-xs text-cuadre-mal">{errores.fechaFin}</p>
          )}
        </div>
      </div>

      {/* Costo */}
      <div>
        <label className="block text-sm font-semibold text-corteza-700 mb-1">
          Costo ($) <span className="text-cuadre-mal">*</span>
        </label>
        <input
          ref={costoRef}
          type="number"
          min="0"
          step="0.01"
          defaultValue={inicial?.costo ?? "0"}
          className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm"
        />
        {errores.costo && <p className="mt-1 text-xs text-cuadre-mal">{errores.costo}</p>}
      </div>

      {/* Sucursal */}
      <div>
        <label className="block text-sm font-semibold text-corteza-700 mb-1">
          Sucursal
        </label>
        <select
          ref={sucursalRef}
          defaultValue={inicial?.sucursalId ?? ""}
          className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm"
        >
          <option value="">Ambas sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Productos */}
      <div>
        <label className="block text-sm font-semibold text-corteza-700 mb-2">
          Productos involucrados <span className="text-cuadre-mal">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto rounded-lg border border-masa-200 p-3">
          {productos.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={productosSeleccionados.includes(p.id)}
                onChange={() => toggleProducto(p.id)}
                className="h-4 w-4 accent-horno-500"
              />
              <span className="text-sm text-corteza-700">{p.nombre}</span>
            </label>
          ))}
        </div>
        {errores.productosIds && (
          <p className="mt-1 text-xs text-cuadre-mal">{errores.productosIds}</p>
        )}
      </div>

      {/* Botones */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-horno-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-horno-600 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : inicial ? "Guardar cambios" : "Crear campaña"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-masa-200 px-5 py-2.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Cancelar
        </button>

        {inicial && (
          <>
            {!confirmEliminar ? (
              <button
                type="button"
                onClick={() => setConfirmEliminar(true)}
                className="ml-auto rounded-lg border border-cuadre-mal/30 px-4 py-2.5 text-sm font-semibold text-cuadre-mal hover:bg-cuadre-mal/10"
              >
                Eliminar
              </button>
            ) : (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-corteza-600">¿Confirmar eliminación?</span>
                <button
                  type="button"
                  onClick={handleEliminar}
                  disabled={isPending}
                  className="rounded-lg bg-cuadre-mal px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmEliminar(false)}
                  className="rounded-lg border border-masa-200 px-4 py-2 text-sm text-corteza-600 hover:bg-masa-100"
                >
                  No
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </form>
  );
}
