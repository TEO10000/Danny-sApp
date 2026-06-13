import { productosConPrecio, etiquetaCategoria, dinero } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const productos = await productosConPrecio(true);

  const grupos = new Map<string, typeof productos>();
  for (const p of productos) {
    const lista = grupos.get(p.categoria) ?? [];
    lista.push(p);
    grupos.set(p.categoria, lista);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-corteza-900">Precios vigentes</h2>
        <p className="mt-1 text-sm text-corteza-600">
          Lista de consulta. Los precios los actualiza el administrador.
        </p>
      </div>

      {productos.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          Aún no hay productos en el catálogo.
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
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <span className="font-semibold text-corteza-900">{p.nombre}</span>
                  <span className="text-lg font-bold text-corteza-900">
                    {p.precioVigente !== null ? dinero(p.precioVigente) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
