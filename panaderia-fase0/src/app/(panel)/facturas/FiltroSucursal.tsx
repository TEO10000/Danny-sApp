"use client";

import { useRouter } from "next/navigation";

export function FiltroSucursal({
  sucursales,
  valorActual,
  estadoActual,
}: {
  sucursales: Array<{ id: string; nombre: string }>;
  valorActual: string;
  estadoActual: string;
}) {
  const router = useRouter();

  const handleChange = (sucursalId: string) => {
    const sp = new URLSearchParams({ estado: estadoActual });
    if (sucursalId) sp.set("sucursal", sucursalId);
    router.push(`/facturas?${sp.toString()}`);
  };

  return (
    <select
      defaultValue={valorActual}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-lg border border-masa-200 bg-white px-3 py-2 text-sm font-semibold text-corteza-600"
    >
      <option value="">Todas las sucursales</option>
      {sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  );
}
