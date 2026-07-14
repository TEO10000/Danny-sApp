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
  const [archivos, setArchivos] = useState<File[]>([]);
  const [thumbUrls, setThumbUrls] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const agregarArchivo = (archivo: File) => {
    if (archivos.length >= 4) return;
    const url = URL.createObjectURL(archivo);
    setArchivos((prev) => [...prev, archivo]);
    setThumbUrls((prev) => [...prev, url]);
    setEstado("idle");
  };

  const quitarArchivo = (idx: number) => {
    setArchivos((prev) => prev.filter((_, i) => i !== idx));
    setThumbUrls((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const escanear = async () => {
    if (archivos.length === 0) return;
    setEstado("cargando");
    setMensajeError("");

    const fd = new FormData();
    archivos.forEach((archivo, i) => fd.append(`archivo_${i}`, archivo));

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
          Agrega una o varias fotos (hasta 4 páginas) y la IA completará el formulario automáticamente.
        </p>
      </div>

      {/* Miniaturas de páginas agregadas */}
      {archivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {archivos.map((archivo, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-masa-200 bg-masa-50">
              {archivo.type.startsWith("image/") ? (
                <img src={thumbUrls[idx]} alt={`Página ${idx + 1}`} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-corteza-400 p-1 text-center">
                  PDF pág. {idx + 1}
                </div>
              )}
              <button
                type="button"
                onClick={() => quitarArchivo(idx)}
                className="absolute top-0 right-0 bg-cuadre-mal text-white text-xs w-5 h-5 flex items-center justify-center rounded-bl-lg"
                aria-label={`Quitar página ${idx + 1}`}
              >
                ×
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs text-center py-0.5">
                pág. {idx + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-2">
        {archivos.length < 4 && (
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 py-2.5 text-sm font-semibold transition ${
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
                if (f) agregarArchivo(f);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
            {archivos.length === 0 ? "Seleccionar imagen o PDF" : "+ Agregar página"}
          </label>
        )}

        {archivos.length > 0 && estado !== "cargando" && (
          <button
            type="button"
            onClick={escanear}
            className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600"
          >
            Escanear {archivos.length > 1 ? `${archivos.length} páginas` : "factura"}
          </button>
        )}

        {estado === "cargando" && (
          <span className="rounded-lg bg-masa-100 px-4 py-2.5 text-sm font-semibold text-corteza-600">
            Leyendo la factura…
          </span>
        )}
      </div>

      {estado === "exito" && (
        <p role="status" className="rounded-lg bg-horno-500/10 px-3 py-2.5 text-sm font-medium text-horno-700">
          Datos pre-llenados por la IA.{" "}
          <strong>Revisa montos, sucursal y líneas antes de guardar.</strong>
        </p>
      )}
      {estado === "error" && (
        <p role="alert" className="rounded-lg bg-cuadre-mal/10 px-3 py-2.5 text-sm font-medium text-cuadre-mal">
          {mensajeError}
        </p>
      )}
    </section>
  );
}
