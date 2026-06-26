"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  sucursales: Array<{ id: string; nombre: string }>;
  sucursalActual: string;
  semanaActual: string;
  semanasDisponibles: string[];
};

const DIAS_ES: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

function etiquetaSemana(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const fin = new Date(d.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${fmt.format(d)} – ${fmt.format(fin)}`;
}

export function FiltrosPlan({
  sucursales,
  sucursalActual,
  semanaActual,
  semanasDisponibles,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function navegar(sucursal: string, semana: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("sucursal", sucursal);
    params.set("semana", semana);
    router.push(`/plan-semanal?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-corteza-500">Sucursal</label>
        <select
          value={sucursalActual}
          onChange={(e) => navegar(e.target.value, semanaActual)}
          className="rounded-lg border border-masa-200 px-3 py-2 text-sm"
        >
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-corteza-500">Semana</label>
        <select
          value={semanaActual}
          onChange={(e) => navegar(sucursalActual, e.target.value)}
          className="rounded-lg border border-masa-200 px-3 py-2 text-sm"
        >
          {semanasDisponibles.map((s) => (
            <option key={s} value={s}>
              {etiquetaSemana(s)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
