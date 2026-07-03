"use client";

import { useEffect, useRef, useState } from "react";

type Opcion = { id: string; etiqueta: string; detalle?: string };

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

export function SelectorBuscador({
  name,
  opciones,
  valorInicial,
  placeholder = "Buscar…",
  etiquetaCrear,
  onCrear,
  onSeleccion,
  requerido,
}: {
  name: string;
  opciones: Opcion[];
  valorInicial?: string;
  placeholder?: string;
  etiquetaCrear?: string;
  onCrear?: () => void;
  onSeleccion?: (id: string) => void;
  requerido?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [valor, setValor] = useState(valorInicial ?? "");

  const contenedorRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const opcionActual = opciones.find((o) => o.id === valor);

  const opcionesFiltradas = busqueda
    ? opciones.filter((o) => normalizar(o.etiqueta).includes(normalizar(busqueda)))
    : opciones;

  const mostrarCrear =
    !!etiquetaCrear && opcionesFiltradas.length === 0 && busqueda.trim().length > 0;

  const seleccionar = (id: string) => {
    setValor(id);
    onSeleccion?.(id);
    cerrar();
  };

  const abrir = () => setAbierto(true);

  const cerrar = () => {
    setAbierto(false);
    setBusqueda("");
  };

  /* Focus al input visible tras abrir */
  useEffect(() => {
    if (!abierto) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    requestAnimationFrame(() => {
      (isMobile ? mobileInputRef : desktopInputRef).current?.focus();
    });
  }, [abierto]);

  /* Cerrar al hacer clic fuera (escritorio) */
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [abierto]);

  /* Cerrar con Escape */
  useEffect(() => {
    if (!abierto) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [abierto]);

  /* Bloquear scroll del body en móvil */
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (abierto && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierto]);

  return (
    <div ref={contenedorRef} className="relative">
      {/* Input oculto para FormData */}
      <input type="hidden" name={name} value={valor} required={requerido} />

      {/* Botón disparador */}
      <button
        type="button"
        onClick={abierto ? cerrar : abrir}
        className={`${inputCls} flex items-center justify-between text-left ${
          opcionActual ? "text-corteza-900" : "text-corteza-400"
        }`}
      >
        <span className="truncate">{opcionActual ? opcionActual.etiqueta : placeholder}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`ml-2 shrink-0 transition-transform duration-150 ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {abierto && (
        <>
          {/* ── Escritorio: dropdown anclado ── */}
          <div className="hidden md:flex flex-col absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-hidden rounded-lg border border-masa-200 bg-white shadow-lg">
            <div className="shrink-0 border-b border-masa-100 bg-white p-2">
              <input
                ref={desktopInputRef}
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border border-masa-200 bg-masa-50 px-2.5 py-2 text-sm outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
              />
            </div>
            <ul role="listbox" className="flex-1 overflow-y-auto">
              {opcionesFiltradas.map((o) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={o.id === valor}
                  onClick={() => seleccionar(o.id)}
                  className={`min-h-[44px] cursor-pointer px-3 py-2 hover:bg-masa-100 ${
                    o.id === valor
                      ? "bg-masa-100 font-semibold text-horno-600"
                      : "text-corteza-800"
                  }`}
                >
                  <p className="text-sm leading-snug">{o.etiqueta}</p>
                  {o.detalle && (
                    <p className="text-xs text-corteza-400">{o.detalle}</p>
                  )}
                </li>
              ))}
              {mostrarCrear && (
                <li
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onCrear?.();
                    cerrar();
                  }}
                  className="min-h-[44px] cursor-pointer px-3 py-2 text-sm font-semibold text-horno-600 hover:bg-horno-500/10"
                >
                  ➕ {etiquetaCrear}
                </li>
              )}
            </ul>
          </div>

          {/* ── Móvil: overlay ── */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-corteza-900/50"
            onClick={cerrar}
            aria-hidden
          />

          {/* ── Móvil: bottom sheet ── */}
          <div
            className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl bg-white"
            style={{ maxHeight: "70dvh" }}
          >
            <div className="shrink-0 flex items-center gap-2 border-b border-masa-200 p-3">
              <input
                ref={mobileInputRef}
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={placeholder}
                className="flex-1 rounded-lg border border-masa-200 bg-masa-50 px-2.5 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
              />
              <button
                type="button"
                onClick={cerrar}
                className="shrink-0 rounded-lg p-2 text-corteza-400 hover:bg-masa-100"
                aria-label="Cerrar"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <ul role="listbox" className="flex-1 overflow-y-auto p-2">
              {opcionesFiltradas.map((o) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={o.id === valor}
                  onClick={() => seleccionar(o.id)}
                  className={`flex min-h-[44px] cursor-pointer flex-col justify-center rounded-lg px-3 py-2 hover:bg-masa-100 ${
                    o.id === valor
                      ? "bg-masa-100 font-semibold text-horno-600"
                      : "text-corteza-800"
                  }`}
                >
                  <p className="text-sm leading-snug">{o.etiqueta}</p>
                  {o.detalle && (
                    <p className="text-xs text-corteza-400">{o.detalle}</p>
                  )}
                </li>
              ))}
              {mostrarCrear && (
                <li
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onCrear?.();
                    cerrar();
                  }}
                  className="flex min-h-[44px] cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-semibold text-horno-600 hover:bg-horno-500/10"
                >
                  ➕ {etiquetaCrear}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
