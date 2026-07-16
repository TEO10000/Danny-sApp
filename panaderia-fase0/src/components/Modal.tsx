"use client";

import { useEffect } from "react";

type ModalProps = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
};

export default function Modal({ abierto, onCerrar, titulo, children }: ModalProps) {
  useEffect(() => {
    if (!abierto) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCerrar();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-30 bg-corteza-900/50" onClick={onCerrar}>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          className="w-full max-w-lg rounded-panel bg-white shadow-xl max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3 border-b border-masa-200 px-5 py-4">
            <h3 className="text-lg font-bold text-corteza-900">{titulo}</h3>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar modal"
              className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-corteza-600 transition hover:bg-masa-100"
            >
              ×
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
