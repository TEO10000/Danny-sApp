"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parsearQRSync, detectarSucursal } from "@/lib/transferencias-qr";
import { normalizarDecimal } from "@/lib/decimales";
import { registrarTransferenciaQR } from "./actions";

type Sucursal = { id: string; nombre: string };

type Confirmacion = {
  crudo: string;
  monto: string;
  comprobante: string;
  pagador: string;
  beneficiario: string;
  sucursalId: string;
  uuid: string;              // UUID Deuna para idempotencia (vacío si no hay)
  fechaFueraDeHoy: boolean;
  esFechaExterna: boolean;   // si la fecha vino del QR (para el aviso)
};

type Toast = { tipo: "ok" | "warn"; texto: string };

type DetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => DetectorLike;
  }
}

function hoyEC(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());
}

export function EscanerQR({
  sucursales,
  sucursalDefaultId,
}: {
  sucursales: Sucursal[];
  sucursalDefaultId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const throttleRef = useRef<number>(0);
  const detectorRef = useRef<DetectorLike | null>(null);
  const [montado, setMontado] = useState(false);

  const [permisoDenegado, setPermisoDenegado] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [contador, setContador] = useState(0);
  const [crudo, setCrudo] = useState("");
  const [mostrarCrudo, setMostrarCrudo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmarFechaExterna, setConfirmarFechaExterna] = useState(false);

  const mostrarToast = useCallback((tipo: Toast["tipo"], texto: string) => {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    setMontado(true);
    return () => setMontado(false);
  }, []);

  const detenerCamara = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setEscaneando(false);
  }, []);

  const iniciarCamara = useCallback(async () => {
    setPermisoDenegado(false);
    setEscaneando(true);
  }, []);

  const procesarTexto = useCallback(
    (texto: string) => {
      detenerCamara();
      navigator.vibrate?.(80);

      const datos = parsearQRSync(texto);
      const hoy = hoyEC();
      let fechaFueraDeHoy = false;
      let esFechaExterna = false;

      // datos.fecha = epoch del QR, SOLO para el aviso "no es de hoy"
      // La hora guardada en BD es siempre new Date() (momento del escaneo)
      if (datos.fecha) {
        const fechaQR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(
          datos.fecha
        );
        fechaFueraDeHoy = fechaQR !== hoy;
        esFechaExterna = true;
      }

      // Autodetectar sucursal: primero por cuenta enmascarada, luego por nombre
      let sucursalId = sucursalDefaultId ?? sucursales[0]?.id ?? "";
      const detectada = detectarSucursal(datos.beneficiario, datos.cuentaEnmascarada);
      if (detectada) {
        const s = sucursales.find((s) => s.nombre === detectada);
        if (s) sucursalId = s.id;
      }

      setCrudo(texto);
      setMostrarCrudo(false);
      setConfirmarFechaExterna(false);
      setConfirmacion({
        crudo: texto,
        monto: datos.monto?.toFixed(2) ?? "",
        comprobante: datos.comprobante ?? "",
        pagador: datos.pagador ?? "",
        beneficiario: datos.beneficiario ?? "",
        sucursalId,
        uuid: datos.uuid ?? "",
        fechaFueraDeHoy,
        esFechaExterna,
      });
    },
    [detenerCamara, sucursales, sucursalDefaultId]
  );

  // Conectar la cámara solo cuando la vista ya está montada
  useEffect(() => {
    if (!escaneando) return;

    let activo = true;

    const arrancarCamara = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (!activo) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setPermisoDenegado(false);
        setEscaneando(true);
      } catch {
        if (!activo) return;
        setPermisoDenegado(true);
        setEscaneando(false);
      }
    };

    arrancarCamara();

    return () => {
      activo = false;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, [escaneando]);

  // Loop de detección
  useEffect(() => {
    if (!escaneando) return;

    let jsQRLib: ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;
    let cancelado = false;

    async function cargarJsQR() {
      if (!("BarcodeDetector" in window)) {
        const mod = await import("jsqr");
        jsQRLib = mod.default as unknown as (data: Uint8ClampedArray, w: number, h: number) => { data: string } | null;
      }
    }

    cargarJsQR();

    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      detectorRef.current = new window.BarcodeDetector!({ formats: ["qr_code"] });
    }

    const tick = () => {
      if (cancelado) return;
      rafRef.current = requestAnimationFrame(tick);

      const now = Date.now();
      if (now - throttleRef.current < 150) return;
      throttleRef.current = now;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      if (detectorRef.current) {
        detectorRef.current.detect(video).then((results) => {
          if (results[0]?.rawValue) procesarTexto(results[0].rawValue);
        }).catch(() => {
          // nada
        });
      } else if (jsQRLib) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const resultado = jsQRLib(imageData.data, imageData.width, imageData.height);
        if (resultado?.data) procesarTexto(resultado.data);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelado = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      detectorRef.current = null;
    };
  }, [escaneando, procesarTexto]);

  useEffect(() => {
    return () => {
      detenerCamara();
    };
  }, [detenerCamara]);

  async function guardar() {
    if (!confirmacion) return;
    const monto = normalizarDecimal(confirmacion.monto);
    if (!monto || monto <= 0) {
      mostrarToast("warn", "Ingresa un monto válido mayor a 0");
      return;
    }

    // Si hay fecha externa fuera de hoy y no confirmó
    if (confirmacion.fechaFueraDeHoy && confirmacion.esFechaExterna && !confirmarFechaExterna) {
      setConfirmarFechaExterna(true);
      return;
    }

    setGuardando(true);
    try {
      const resultado = await registrarTransferenciaQR({
        sucursalId: confirmacion.sucursalId,
        monto,
        crudo: confirmacion.crudo,
        comprobante: confirmacion.comprobante || undefined,
        uuid: confirmacion.uuid || undefined,
        pagador: confirmacion.pagador || undefined,
        beneficiario: confirmacion.beneficiario || undefined,
      });

      if ("duplicada" in resultado && resultado.duplicada) {
        mostrarToast("warn", `Ya registrada hoy a las ${resultado.hora}`);
        setConfirmacion(null);
        setConfirmarFechaExterna(false);
        await iniciarCamara();
        return;
      }

      if ("ok" in resultado && resultado.ok) {
        setContador((c) => c + 1);
        mostrarToast("ok", "Guardada ✓");
        setConfirmacion(null);
        setConfirmarFechaExterna(false);
        await iniciarCamara();
        return;
      }

      if ("error" in resultado) {
        mostrarToast("warn", resultado.error);
      }
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    setConfirmacion(null);
    setConfirmarFechaExterna(false);
    iniciarCamara();
  }

  const toastNode = toast ? (
    <div
      className={`fixed top-4 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
        toast.tipo === "ok" ? "bg-cuadre-ok text-white" : "bg-amber-500 text-white"
      }`}
    >
      {toast.texto}
    </div>
  ) : null;

  const portalTarget = montado && typeof document !== "undefined" ? document.body : null;

  // ── Render: pantalla inicial ───────────────────────────────────────────────
  if (!escaneando && !confirmacion) {
    const contenido = (
      <>
        {permisoDenegado ? (
          <div className="rounded-panel border border-masa-200 bg-white p-6 text-center">
            <p className="text-corteza-700 font-semibold">Permiso de cámara denegado</p>
            <p className="mt-1 text-sm text-corteza-400">
              Permite el acceso a la cámara en la configuración del navegador y vuelve a intentarlo.
            </p>
            <button
              onClick={iniciarCamara}
              className="mt-4 w-full rounded-lg bg-horno-500 py-3 text-white font-semibold hover:bg-horno-600"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <button
            onClick={iniciarCamara}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-horno-500 px-6 py-4 text-lg font-bold text-white shadow-lg hover:bg-horno-600 active:scale-95 transition-transform"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="5" y="5" width="3" height="3" fill="white" stroke="none" />
              <rect x="16" y="5" width="3" height="3" fill="white" stroke="none" />
              <rect x="5" y="16" width="3" height="3" fill="white" stroke="none" />
              <path d="M14 14h3v3" />
              <path d="M21 14v7h-7v-4" />
            </svg>
            Escanear QR
            {contador > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-sm">
                {contador}
              </span>
            )}
          </button>
        )}
      </>
    );

    return (
      <>
        {portalTarget ? createPortal(toastNode, portalTarget) : toastNode}
        {contenido}
      </>
    );
  }

  // ── Render: cámara activa ─────────────────────────────────────────────────
  if (escaneando) {
    const contenido = (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        <div className="flex items-center justify-between p-4">
          <p className="text-white font-semibold">Apunta al código QR</p>
          <button
            onClick={detenerCamara}
            className="rounded-lg p-2 text-white/70 hover:text-white"
            aria-label="Cerrar escáner"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 flex items-center justify-center">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          {/* Recuadro guía */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 border-4 border-horno-400 rounded-2xl opacity-80" />
          </div>
        </div>

        <div className="p-4 text-center">
          <p className="text-white/50 text-sm">
            {contador > 0 ? `${contador} escaneada${contador !== 1 ? "s" : ""}` : "Detectando…"}
          </p>
        </div>
      </div>
    );

    return (
      <>
        {portalTarget ? createPortal(toastNode, portalTarget) : toastNode}
        {portalTarget ? createPortal(contenido, portalTarget) : contenido}
      </>
    );
  }

  // ── Render: tarjeta de confirmación ──────────────────────────────────────
  const contenidoConfirmacion = (
    <div className="fixed inset-0 z-[60] bg-corteza-900/80 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-corteza-900">Confirmar transferencia</h3>
          <button
            onClick={descartar}
            className="rounded-lg p-1.5 text-corteza-400 hover:bg-masa-100"
            aria-label="Descartar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {confirmacion && (
          <>
            {confirmacion.fechaFueraDeHoy && confirmacion.esFechaExterna && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
                <p className="font-semibold">⚠ Este comprobante no es de hoy</p>
                {confirmarFechaExterna ? (
                  <p className="mt-1">¿Confirmas que quieres guardarlo igual?</p>
                ) : (
                  <p className="mt-1">Revisa que el QR sea del turno actual antes de guardar.</p>
                )}
              </div>
            )}

            {/* Monto */}
            <div>
              <label className="block text-xs font-semibold text-corteza-500 uppercase tracking-wide mb-1">
                Monto
              </label>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={confirmacion.monto}
                onChange={(e) =>
                  setConfirmacion((c) => c && { ...c, monto: e.target.value })
                }
                placeholder="0.00"
                className="w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-3 text-2xl font-bold text-corteza-900 outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
              />
            </div>

            {/* Sucursal */}
            <div>
              <label className="block text-xs font-semibold text-corteza-500 uppercase tracking-wide mb-1">
                Sucursal
              </label>
              <div className="flex gap-2">
                {sucursales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setConfirmacion((c) => c && { ...c, sucursalId: s.id })
                    }
                    className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                      confirmacion.sucursalId === s.id
                        ? "border-horno-500 bg-horno-500 text-white"
                        : "border-masa-200 text-corteza-600 hover:bg-masa-100"
                    }`}
                  >
                    {s.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Pagador */}
            <div>
              <label className="block text-xs font-semibold text-corteza-500 uppercase tracking-wide mb-1">
                Pagador
              </label>
              <input
                type="text"
                value={confirmacion.pagador}
                onChange={(e) =>
                  setConfirmacion((c) => c && { ...c, pagador: e.target.value })
                }
                placeholder="Nombre (opcional)"
                className="w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base text-corteza-900 outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
              />
            </div>

            {/* Comprobante */}
            <div>
              <label className="block text-xs font-semibold text-corteza-500 uppercase tracking-wide mb-1">
                Nro. comprobante
              </label>
              <input
                type="text"
                value={confirmacion.comprobante}
                onChange={(e) =>
                  setConfirmacion((c) => c && { ...c, comprobante: e.target.value })
                }
                placeholder="Opcional"
                className="w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base text-corteza-900 outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30"
              />
            </div>

            {/* Acciones */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={guardar}
                disabled={guardando}
                className="w-full rounded-xl bg-horno-500 py-4 text-lg font-bold text-white hover:bg-horno-600 disabled:opacity-60 active:scale-95 transition-transform"
              >
                {guardando ? "Guardando…" : confirmarFechaExterna ? "Sí, guardar igual" : "Guardar"}
              </button>
              <button
                onClick={descartar}
                className="w-full rounded-xl border border-masa-200 py-3 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
              >
                Descartar
              </button>
            </div>

            {/* Ver contenido crudo */}
            <div className="border-t border-masa-100 pt-3">
              <button
                type="button"
                onClick={() => setMostrarCrudo((v) => !v)}
                className="text-xs text-corteza-400 hover:text-corteza-600 underline"
              >
                {mostrarCrudo ? "Ocultar" : "Ver"} contenido crudo
              </button>
              {mostrarCrudo && (
                <div className="mt-2 rounded-lg bg-masa-50 border border-masa-200 p-3">
                  <pre className="text-xs text-corteza-600 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {crudo}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(crudo);
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 1500);
                    }}
                    className="mt-2 text-xs font-semibold text-horno-600 hover:underline"
                  >
                    {copiado ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {portalTarget ? createPortal(toastNode, portalTarget) : toastNode}
      {portalTarget ? createPortal(contenidoConfirmacion, portalTarget) : contenidoConfirmacion}
    </>
  );
}
