"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Enlace = { href: string; etiqueta: string; icono: string };

/* ── Íconos SVG inline (outline 20×20, stroke="currentColor") ── */
const ICONOS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  produccion: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2C8 2 4 6.5 4 10.5c0 2.8 1.5 5.2 4 6.4V20h8v-3.1c2.5-1.2 4-3.6 4-6.4C20 6.5 16 2 12 2z" />
      <line x1="9" y1="20" x2="15" y2="20" />
    </svg>
  ),
  caja: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  ),
  facturas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  ),
  catalogo: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  precios: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  campanias: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  ),
  "plan-semanal": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  "chat-ia": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M9 10h.01M13 10h.01M17 10h.01" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
};

const itemBase =
  "flex items-center gap-3 min-h-[44px] px-3 rounded-lg text-sm font-semibold transition-colors";
const itemActivo = "bg-masa-100 text-horno-600 border-r-2 border-horno-500 rounded-r-none";
const itemInactivo = "text-corteza-600 hover:bg-masa-50";

export function Sidebar({
  enlaces,
  nombreUsuario,
  rolLegible,
  children,
}: {
  enlaces: Enlace[];
  nombreUsuario: string;
  rolLegible: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [colapsado, setColapsado] = useState(false);
  const [montado, setMontado] = useState(false);
  const [drawerAbierto, setDrawerAbierto] = useState(false);

  useEffect(() => {
    setMontado(true);
    if (localStorage.getItem("sidebar-colapsada") === "true") setColapsado(true);
  }, []);

  const toggleColapsado = () => {
    setColapsado((c) => {
      localStorage.setItem("sidebar-colapsada", String(!c));
      return !c;
    });
  };

  const cerrarDrawer = () => setDrawerAbierto(false);

  useEffect(() => {
    if (drawerAbierto) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerAbierto]);

  const esActivo = (href: string) => pathname.startsWith(href);

  return (
    <>
      {/* ── MÓVIL: barra superior fija ── */}
      <header className="md:hidden fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-masa-200 bg-white px-3">
        <button
          type="button"
          onClick={() => setDrawerAbierto(true)}
          className="rounded-lg p-2 text-corteza-600 hover:bg-masa-100"
          aria-label="Abrir menú"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span aria-hidden className="block h-4 w-8 rounded-t-full bg-horno-500" />
          <span className="font-bold text-corteza-900">Panadería</span>
        </div>
        {/* Salir en la barra superior móvil */}
        <div>{children}</div>
      </header>

      {/* MÓVIL: overlay del drawer */}
      {drawerAbierto && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-corteza-900/50"
          onClick={cerrarDrawer}
          aria-hidden
        />
      )}

      {/* MÓVIL: drawer */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white shadow-xl transition-transform duration-200 ${
          drawerAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-masa-200 px-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="block h-4 w-8 rounded-t-full bg-horno-500" />
            <span className="font-bold text-corteza-900">Panadería</span>
          </div>
          <button
            type="button"
            onClick={cerrarDrawer}
            className="rounded-lg p-1.5 text-corteza-400 hover:bg-masa-100"
            aria-label="Cerrar menú"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              onClick={cerrarDrawer}
              className={`${itemBase} mb-0.5 ${esActivo(e.href) ? itemActivo : itemInactivo}`}
            >
              <span className="shrink-0">{ICONOS[e.icono]}</span>
              <span>{e.etiqueta}</span>
            </Link>
          ))}
        </nav>

        <div className="shrink-0 border-t border-masa-200 p-4">
          <p className="truncate text-xs font-semibold text-corteza-800">{nombreUsuario}</p>
          <p className="text-xs text-corteza-400">{rolLegible}</p>
        </div>
      </div>

      {/* ── ESCRITORIO: sidebar lateral ── */}
      <aside
        style={{ width: montado ? (colapsado ? "4rem" : "15rem") : "15rem" }}
        className="hidden md:flex shrink-0 flex-col sticky top-0 h-screen overflow-hidden border-r border-masa-200 bg-white transition-[width] duration-200"
      >
        {/* Logo */}
        <div
          className={`flex h-14 shrink-0 items-center border-b border-masa-200 ${
            colapsado ? "justify-center px-3" : "gap-2.5 px-4"
          }`}
        >
          <span aria-hidden className="block h-4 w-8 shrink-0 rounded-t-full bg-horno-500" />
          {!colapsado && (
            <span className="truncate font-bold text-corteza-900">Panadería</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              title={colapsado ? e.etiqueta : undefined}
              className={`${itemBase} mb-0.5 ${colapsado ? "justify-center" : ""} ${
                esActivo(e.href) ? itemActivo : itemInactivo
              }`}
            >
              <span className="shrink-0">{ICONOS[e.icono]}</span>
              {!colapsado && <span className="truncate">{e.etiqueta}</span>}
            </Link>
          ))}
        </nav>

        {/* Footer: info usuario + Salir + botón colapsar */}
        <div className="shrink-0 border-t border-masa-200 p-3 space-y-2">
          {!colapsado && (
            <div>
              <p className="truncate text-xs font-semibold text-corteza-800">{nombreUsuario}</p>
              <p className="text-xs text-corteza-400">{rolLegible}</p>
              <div className="mt-2">{children}</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleColapsado}
            className="flex w-full items-center justify-center rounded-lg p-1.5 text-corteza-400 hover:bg-masa-100"
            title={colapsado ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {colapsado ? (
                <polyline points="9 18 15 12 9 6" />
              ) : (
                <polyline points="15 18 9 12 15 6" />
              )}
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}
