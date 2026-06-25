"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FiltroDashboard({
  sucursales,
  sucursalActual,
  desdeActual,
  hastaActual,
}: {
  sucursales: Array<{ id: string; nombre: string }>;
  sucursalActual: string;
  desdeActual: string;
  hastaActual: string;
}) {
  const router = useRouter();
  const [sucursal, setSucursal] = useState(sucursalActual);
  const [desde, setDesde] = useState(desdeActual);
  const [hasta, setHasta] = useState(hastaActual);

  const aplicar = () => {
    const sp = new URLSearchParams({ desde, hasta });
    if (sucursal) sp.set("sucursal", sucursal);
    router.push(`/dashboard?${sp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-semibold text-corteza-600 mb-1">Sucursal</label>
        <select
          value={sucursal}
          onChange={(e) => setSucursal(e.target.value)}
          className="rounded-lg border border-masa-200 bg-white px-3 py-2 text-sm text-corteza-700"
        >
          <option value="">Consolidado</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-corteza-600 mb-1">Desde</label>
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="rounded-lg border border-masa-200 bg-white px-3 py-2 text-sm text-corteza-700"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-corteza-600 mb-1">Hasta</label>
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="rounded-lg border border-masa-200 bg-white px-3 py-2 text-sm text-corteza-700"
        />
      </div>
      <button
        onClick={aplicar}
        className="rounded-lg bg-horno-500 px-4 py-2 text-sm font-semibold text-white hover:bg-horno-600"
      >
        Filtrar
      </button>
    </div>
  );
}
