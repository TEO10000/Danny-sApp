"use client";

import { useRef, useState } from "react";
import type { ValoresInicialesFactura } from "./FacturaForm";

export function EscanearFactura({
  onEscaneado,
}: {
  onEscaneado: (datos: ValoresInicialesFactura) => void;
}) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "exito" | "error">("idle");
  const [mensajeError, setMensajeError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const procesarArchivo = async (archivo: File) => {
    setEstado("cargando");
    setMensajeError("");

    const fd = new FormData();
    fd.append("archivo", archivo);

    try {
      const res = await fetch("/api/ia/escanear-factura", { method: "POST", body: fd });
      const cuerpo = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          (cuerpo as { error?: string }).error ??
            "No pudimos leer la factura. Regístrala manualmente abajo."
        );
      }

      setEstado("exito");
      onEscaneado({ ...(cuerpo as ValoresInicialesFactura), origenRegistro: "ESCANEO_IA" });
    } catch (err) {
      setEstado("error");
      setMensajeError(
        err instanceof Error
          ? err.message
          : "No pudimos leer la factura. Regístrala manualmente abajo."
      );
    }
  };

  return (
    <section className="rounded-panel border border-masa-200 bg-white p-5 space-y-3">
      <div>
        <h3 className="font-bold text-corteza-900">Escanear factura con IA</h3>
        <p className="mt-0.5 text-sm text-corteza-600">
          Toma una foto o sube el PDF y la IA completará el formulario automáticamente.
        </p>
      </div>

      <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-sm font-semibold transition ${
          estado === "cargando"
            ? "border-masa-300 text-corteza-400 cursor-not-allowed"
            : "border-horno-400 text-horno-600 hover:bg-horno-500/5"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          disabled={estado === "cargando"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) procesarArchivo(f);
            // Resetear para permitir re-seleccionar el mismo archivo
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        {estado === "cargando" ? "Leyendo la factura…" : "Seleccionar imagen o PDF"}
      </label>

      {estado === "exito" && (
        <p
          role="status"
          className="rounded-lg bg-horno-500/10 px-3 py-2.5 text-sm font-medium text-horno-700"
        >
          Datos pre-llenados por la IA.{" "}
          <strong>Revisa montos, sucursal y líneas antes de guardar.</strong>{" "}
          Puedes corregir cualquier campo.
        </p>
      )}
      {estado === "error" && (
        <p
          role="alert"
          className="rounded-lg bg-cuadre-mal/10 px-3 py-2.5 text-sm font-medium text-cuadre-mal"
        >
          {mensajeError}
        </p>
      )}
    </section>
  );
}
