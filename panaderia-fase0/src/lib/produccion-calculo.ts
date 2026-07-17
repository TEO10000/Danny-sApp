export type DetalleParaCalculo = {
  numLatas: number | null;
  panesPorLata: number | null;
  cantidadUnidades: number | null;
  mermas: number;
};

export function produccionBruta(d: DetalleParaCalculo): number {
  return d.cantidadUnidades != null
    ? d.cantidadUnidades
    : (d.numLatas ?? 0) * (d.panesPorLata ?? 0);
}

export function unidadesBuenas(d: DetalleParaCalculo): number {
  return Math.max(produccionBruta(d) - d.mermas, 0);
}
