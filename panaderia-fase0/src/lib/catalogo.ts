import { prisma } from "@/lib/prisma";

export type CategoriaProducto =
  | "PAN_SAL"
  | "PAN_DULCE"
  | "PASTELERIA"
  | "GALLETERIA"
  | "EMPAQUETADO";

export const CATEGORIAS: Array<{ valor: CategoriaProducto; etiqueta: string }> = [
  { valor: "PAN_SAL", etiqueta: "Pan de sal" },
  { valor: "PAN_DULCE", etiqueta: "Pan de dulce" },
  { valor: "PASTELERIA", etiqueta: "Pastelería" },
  { valor: "GALLETERIA", etiqueta: "Galletería" },
  { valor: "EMPAQUETADO", etiqueta: "Empaquetado" },
];

export function etiquetaCategoria(valor: string): string {
  return CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

export function dinero(valor: number): string {
  return `$${valor.toFixed(2)}`;
}

export type ProductoConPrecio = {
  id: string;
  nombre: string;
  categoria: CategoriaProducto;
  codigoBarras: string | null;
  activo: boolean;
  precioVigente: number | null;
};

/**
 * Productos con su precio vigente (el más reciente del historial).
 * `soloActivos` filtra los productos dados de baja.
 */
export async function productosConPrecio(soloActivos = false): Promise<ProductoConPrecio[]> {
  const productos = await prisma.producto.findMany({
    where: soloActivos ? { activo: true } : undefined,
    include: { precios: { orderBy: { vigenteDesde: "desc" }, take: 1 } },
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });
  type ProductoCrudo = {
    id: string;
    nombre: string;
    categoria: CategoriaProducto;
    codigoBarras: string | null;
    activo: boolean;
    precios: Array<{ precio: unknown }>;
  };
  return (productos as ProductoCrudo[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    codigoBarras: p.codigoBarras,
    activo: p.activo,
    precioVigente: p.precios[0] ? Number(p.precios[0].precio) : null,
  }));
}

/**
 * Precio vigente de cada producto EN una fecha dada (para valorar coches
 * antiguos con el precio de su día, no con el de hoy).
 */
export async function preciosVigentesEn(fecha: Date): Promise<Map<string, number>> {
  const precios = await prisma.precioProducto.findMany({
    where: { vigenteDesde: { lte: fecha } },
    orderBy: { vigenteDesde: "desc" },
  });
  const mapa = new Map<string, number>();
  for (const p of precios as Array<{ productoId: string; precio: unknown }>) {
    if (!mapa.has(p.productoId)) mapa.set(p.productoId, Number(p.precio));
  }
  return mapa;
}
