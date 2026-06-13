import { productosConPrecio, etiquetaCategoria, dinero } from "@/lib/catalogo";
import { FormNuevoProducto, FormPrecio } from "./Formularios";
import { cambiarActivo } from "./actions";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const productos = await productosConPrecio();

  // Agrupar por categoría para que el mostrador y el horno se lean igual que en la vitrina
  const grupos = new Map<string, typeof productos>();
  for (const p of productos) {
    const lista = grupos.get(p.categoria) ?? [];
    lista.push(p);
    grupos.set(p.categoria, lista);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-corteza-900">Catálogo y precios</h2>
        <p className="mt-1 text-sm text-corteza-600">
          Cada cambio de precio guarda el anterior en el historial: las
          estadísticas de días pasados se calculan con el precio de ese día.
        </p>
      </div>

      <FormNuevoProducto />

      {productos.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          El catálogo está vacío. Agrega el primer producto con el formulario de
          arriba: nombre, categoría y precio de venta bastan para empezar.
        </section>
      ) : (
        Array.from(grupos.entries()).map(([categoria, lista]) => (
          <section
            key={categoria}
            className="overflow-hidden rounded-panel border border-masa-200 bg-white"
          >
            <h3 className="border-b border-masa-200 bg-masa-50 px-5 py-3 font-bold text-corteza-900">
              {etiquetaCategoria(categoria)}
            </h3>
            <ul className="divide-y divide-masa-100">
              {lista.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p
                      className={`font-semibold ${
                        p.activo ? "text-corteza-900" : "text-corteza-400 line-through"
                      }`}
                    >
                      {p.nombre}
                    </p>
                    <p className="text-sm text-corteza-400">
                      {p.precioVigente !== null ? dinero(p.precioVigente) : "Sin precio"}
                      {p.codigoBarras ? ` · cód. ${p.codigoBarras}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <FormPrecio productoId={p.id} precioActual={p.precioVigente} />
                    <form action={cambiarActivo}>
                      <input type="hidden" name="productoId" value={p.id} />
                      <input type="hidden" name="activo" value={String(!p.activo)} />
                      <button
                        type="submit"
                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                          p.activo
                            ? "text-corteza-400 hover:bg-masa-100"
                            : "bg-cuadre-ok/10 text-cuadre-ok hover:bg-cuadre-ok/20"
                        }`}
                      >
                        {p.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
