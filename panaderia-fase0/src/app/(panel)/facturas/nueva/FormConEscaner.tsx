"use client";

import { useState } from "react";
import { FacturaForm, type ValoresInicialesFactura } from "../FacturaForm";
import { EscanearFactura } from "../EscanearFactura";
import type { InsumoConUltimoCosto } from "@/lib/facturas";

type Proveedor = { id: string; nombre: string };
type Sucursal = { id: string; nombre: string };

export function FormConEscaner({
  proveedores,
  insumos,
  sucursales,
  hoy,
}: {
  proveedores: Proveedor[];
  insumos: InsumoConUltimoCosto[];
  sucursales: Sucursal[];
  hoy: string;
}) {
  const [valoresIniciales, setValoresIniciales] = useState<
    ValoresInicialesFactura | undefined
  >(undefined);
  // Incrementar esta clave fuerza el re-mount de FacturaForm con nuevos valores iniciales
  const [claveForm, setClaveForm] = useState(0);

  const aplicarEscaneo = (datos: ValoresInicialesFactura) => {
    setValoresIniciales(datos);
    setClaveForm((k) => k + 1);
  };

  return (
    <div className="space-y-5">
      <EscanearFactura onEscaneado={aplicarEscaneo} />
      <FacturaForm
        key={claveForm}
        proveedores={proveedores}
        insumos={insumos}
        sucursales={sucursales}
        hoy={hoy}
        valoresIniciales={valoresIniciales}
      />
    </div>
  );
}
