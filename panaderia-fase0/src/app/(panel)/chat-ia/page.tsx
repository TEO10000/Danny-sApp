"use client";

import { useState, useRef, useEffect } from "react";

type Mensaje = {
  rol: "usuario" | "asistente" | "error";
  texto: string;
  hora: Date;
};

const fmtHora = new Intl.DateTimeFormat("es-EC", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Guayaquil",
});

export default function ChatIAPage() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [cargando, setCargando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = pregunta.trim();
    if (!texto || cargando) return;

    const msgUsuario: Mensaje = { rol: "usuario", texto, hora: new Date() };
    setMensajes((prev) => [...prev, msgUsuario]);
    setPregunta("");
    setCargando(true);

    try {
      const res = await fetch("/api/ia/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: texto }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMensajes((prev) => [
          ...prev,
          {
            rol: "error",
            texto: body.error ?? "Ocurrió un error al consultar la IA.",
            hora: new Date(),
          },
        ]);
      } else {
        const data = (await res.json()) as { respuesta: string };
        setMensajes((prev) => [
          ...prev,
          { rol: "asistente", texto: data.respuesta, hora: new Date() },
        ]);
      }
    } catch {
      setMensajes((prev) => [
        ...prev,
        {
          rol: "error",
          texto: "No se pudo conectar con el servidor. Intenta de nuevo.",
          hora: new Date(),
        },
      ]);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-160px)] max-h-[700px]">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Chat IA</h2>
          <p className="text-sm text-corteza-400">
            Consulta datos del negocio con inteligencia artificial
          </p>
        </div>
        {mensajes.length > 0 && (
          <button
            onClick={() => setMensajes([])}
            className="rounded-lg border border-masa-200 px-3 py-1.5 text-xs font-semibold text-corteza-600 hover:bg-masa-100"
          >
            Nueva conversación
          </button>
        )}
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto rounded-panel border border-masa-200 bg-masa-50 p-4 space-y-3">
        {mensajes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-corteza-400 space-y-2">
            <p className="text-sm font-medium">¿En qué puedo ayudarte hoy?</p>
            <p className="text-xs max-w-xs">
              Puedo responder preguntas sobre ventas, costos, facturas y campañas de los últimos 30 días.
            </p>
          </div>
        )}

        {mensajes.map((m, i) => {
          if (m.rol === "usuario") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[75%] space-y-1">
                  <div className="rounded-2xl rounded-tr-sm bg-horno-500 px-4 py-2.5 text-sm text-white">
                    {m.texto}
                  </div>
                  <p className="text-right text-xs text-corteza-400">{fmtHora.format(m.hora)}</p>
                </div>
              </div>
            );
          }

          if (m.rol === "error") {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[75%] space-y-1">
                  <div className="rounded-2xl rounded-tl-sm bg-cuadre-mal/10 border border-cuadre-mal/20 px-4 py-2.5 text-sm text-cuadre-mal">
                    {m.texto}
                  </div>
                  <p className="text-xs text-corteza-400">{fmtHora.format(m.hora)}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[75%] space-y-1">
                <div className="rounded-2xl rounded-tl-sm bg-white border border-masa-200 px-4 py-2.5 text-sm text-corteza-800 whitespace-pre-wrap">
                  {m.texto}
                </div>
                <p className="text-xs text-corteza-400">{fmtHora.format(m.hora)}</p>
              </div>
            </div>
          );
        })}

        {cargando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-white border border-masa-200 px-4 py-2.5 text-sm text-corteza-400 italic">
              Pensando…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={enviar} className="mt-3 flex gap-2">
        <input
          type="text"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Escribe tu pregunta…"
          disabled={cargando}
          className="flex-1 rounded-lg border border-masa-200 px-4 py-2.5 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={cargando || !pregunta.trim()}
          className="rounded-lg bg-horno-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-horno-600 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
