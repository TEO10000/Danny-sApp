"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  crearUsuario,
  editarUsuario,
  resetearPassword,
  cambiarEstadoUsuario,
  type EstadoAccion,
} from "./actions";

const inputCls =
  "w-full rounded-lg border border-masa-200 bg-masa-50 px-3 py-2.5 text-base outline-none focus:border-horno-500 focus:ring-2 focus:ring-horno-400/30";

const ROLES = [
  { valor: "ADMIN", etiqueta: "Administrador" },
  { valor: "PANADERO", etiqueta: "Panadero" },
  { valor: "ATENCION_CLIENTE", etiqueta: "Atención al Cliente" },
];

function BotonGuardar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600 disabled:opacity-60"
    >
      {pending ? "Guardando…" : texto}
    </button>
  );
}

function MensajeEstado({ estado }: { estado: EstadoAccion }) {
  if (!estado) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
        estado.ok ? "bg-cuadre-ok/10 text-cuadre-ok" : "bg-cuadre-mal/10 text-cuadre-mal"
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

export function FormNuevoUsuario() {
  const [estado, accion] = useFormState(crearUsuario, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (estado?.ok) {
      formRef.current?.reset();
      setAbierto(false);
    }
  }, [estado]);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-horno-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-horno-600"
      >
        + Nuevo usuario
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={accion}
      className="rounded-panel border border-masa-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-corteza-900">Nuevo usuario</h3>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-corteza-400 hover:text-corteza-600"
          aria-label="Cancelar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nu-nombre" className="block text-sm font-semibold text-corteza-800">
            Nombre completo
          </label>
          <input id="nu-nombre" name="nombre" required minLength={2} className={`mt-1.5 ${inputCls}`} placeholder="María García" />
        </div>
        <div>
          <label htmlFor="nu-email" className="block text-sm font-semibold text-corteza-800">
            Email
          </label>
          <input id="nu-email" name="email" type="email" required className={`mt-1.5 ${inputCls}`} placeholder="maria@panaderia.com" />
        </div>
        <div>
          <label htmlFor="nu-rol" className="block text-sm font-semibold text-corteza-800">
            Rol
          </label>
          <select id="nu-rol" name="rol" className={`mt-1.5 ${inputCls}`}>
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nu-password" className="block text-sm font-semibold text-corteza-800">
            Contraseña inicial
          </label>
          <input id="nu-password" name="password" type="password" required minLength={8} className={`mt-1.5 ${inputCls}`} placeholder="Mín. 8 caracteres" />
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        <BotonGuardar texto="Crear usuario" />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg border border-masa-200 px-4 py-2.5 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Cancelar
        </button>
      </div>
      <MensajeEstado estado={estado} />
    </form>
  );
}

export function FormEditarUsuario({
  usuario,
}: {
  usuario: { id: string; nombre: string; email: string; rol: string };
}) {
  const [estado, accion] = useFormState(editarUsuario, null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (estado?.ok) setAbierto(false);
  }, [estado]);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
      >
        Editar
      </button>
    );
  }

  return (
    <form action={accion} className="mt-3 space-y-3 rounded-lg border border-masa-200 bg-masa-50 p-4">
      <input type="hidden" name="id" value={usuario.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`e-nombre-${usuario.id}`} className="block text-sm font-semibold text-corteza-800">
            Nombre
          </label>
          <input
            id={`e-nombre-${usuario.id}`}
            name="nombre"
            defaultValue={usuario.nombre}
            required
            minLength={2}
            className={`mt-1 ${inputCls}`}
          />
        </div>
        <div>
          <label htmlFor={`e-email-${usuario.id}`} className="block text-sm font-semibold text-corteza-800">
            Email
          </label>
          <input
            id={`e-email-${usuario.id}`}
            name="email"
            type="email"
            defaultValue={usuario.email}
            required
            className={`mt-1 ${inputCls}`}
          />
        </div>
        <div>
          <label htmlFor={`e-rol-${usuario.id}`} className="block text-sm font-semibold text-corteza-800">
            Rol
          </label>
          <select id={`e-rol-${usuario.id}`} name="rol" defaultValue={usuario.rol} className={`mt-1 ${inputCls}`}>
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <BotonGuardar texto="Guardar cambios" />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Cancelar
        </button>
      </div>
      <MensajeEstado estado={estado} />
    </form>
  );
}

export function FormResetPassword({ usuarioId, nombreUsuario }: { usuarioId: string; nombreUsuario: string }) {
  const [estado, accion] = useFormState(resetearPassword, null);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const copiar = async () => {
    if (estado?.passwordTemporal) {
      await navigator.clipboard.writeText(estado.passwordTemporal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  };

  if (estado?.ok && estado.passwordTemporal) {
    return (
      <div className="mt-3 rounded-lg border border-cuadre-ok/30 bg-cuadre-ok/5 p-4">
        <p className="text-sm font-semibold text-cuadre-ok">{estado.mensaje}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-sm text-corteza-900 border border-masa-200">
            {estado.passwordTemporal}
          </code>
          <button
            type="button"
            onClick={copiar}
            className="rounded-lg bg-horno-500 px-3 py-2 text-sm font-semibold text-white hover:bg-horno-600"
          >
            {copiado ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
      >
        Restablecer contraseña
      </button>
    );
  }

  return (
    <form action={accion} className="mt-3 rounded-lg border border-cuadre-mal/30 bg-cuadre-mal/5 p-4">
      <input type="hidden" name="id" value={usuarioId} />
      <p className="text-sm text-corteza-800">
        ¿Restablecer la contraseña de <strong>{nombreUsuario}</strong>? Se generará una contraseña temporal que deberás copiar ahora.
      </p>
      <div className="mt-3 flex gap-2">
        <BotonGuardar texto="Sí, restablecer" />
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
        >
          Cancelar
        </button>
      </div>
      <MensajeEstado estado={estado} />
    </form>
  );
}

export function BtnCambiarEstado({
  usuarioId,
  nombreUsuario,
  activo,
}: {
  usuarioId: string;
  nombreUsuario: string;
  activo: boolean;
}) {
  const [estado, accion] = useFormState(cambiarEstadoUsuario, null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (estado?.ok) setConfirmando(false);
  }, [estado]);

  if (activo && confirmando) {
    return (
      <form action={accion} className="mt-3 rounded-lg border border-cuadre-mal/30 bg-cuadre-mal/5 p-4">
        <input type="hidden" name="id" value={usuarioId} />
        <input type="hidden" name="activar" value="false" />
        <p className="text-sm text-corteza-800">
          ¿Desactivar a <strong>{nombreUsuario}</strong>? No podrá iniciar sesión y sus sesiones activas se cerrarán.
        </p>
        <div className="mt-3 flex gap-2">
          <BotonGuardar texto="Sí, desactivar" />
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
          >
            Cancelar
          </button>
        </div>
        <MensajeEstado estado={estado} />
      </form>
    );
  }

  return (
    <div>
      <form action={accion}>
        <input type="hidden" name="id" value={usuarioId} />
        <input type="hidden" name="activar" value={String(!activo)} />
        <button
          type={activo ? "button" : "submit"}
          onClick={activo ? () => setConfirmando(true) : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            activo
              ? "text-corteza-400 hover:bg-masa-100"
              : "bg-cuadre-ok/10 text-cuadre-ok hover:bg-cuadre-ok/20"
          }`}
        >
          {activo ? "Desactivar" : "Reactivar"}
        </button>
      </form>
      {!activo && estado && !estado.ok && <MensajeEstado estado={estado} />}
    </div>
  );
}
