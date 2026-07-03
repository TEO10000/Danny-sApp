import { prisma } from "@/lib/prisma";
import { FormNuevoUsuario, FormEditarUsuario, FormResetPassword, BtnCambiarEstado } from "./Formularios";

export const dynamic = "force-dynamic";

const ROL_LEGIBLE: Record<string, string> = {
  ADMIN: "Administrador",
  PANADERO: "Panadero",
  ATENCION_CLIENTE: "Atención al Cliente",
};

function formatearFecha(fecha: Date): string {
  return fecha.toLocaleDateString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function UsuariosPage() {
  const usuarios = await prisma.user.findMany({
    orderBy: [{ activo: "desc" }, { createdAt: "asc" }],
  });

  const activos = usuarios.filter((u) => u.activo);
  const inactivos = usuarios.filter((u) => !u.activo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-corteza-900">Usuarios</h2>
          <p className="mt-1 text-sm text-corteza-600">
            Gestión de accesos al sistema. Los usuarios inactivos no pueden iniciar sesión.
          </p>
        </div>
        <FormNuevoUsuario />
      </div>

      {usuarios.length === 0 ? (
        <section className="rounded-panel border border-masa-200 bg-white p-6 text-corteza-600">
          No hay usuarios registrados.
        </section>
      ) : (
        <>
          <GrupoUsuarios titulo="Usuarios activos" usuarios={activos} />
          {inactivos.length > 0 && (
            <GrupoUsuarios titulo="Usuarios inactivos" usuarios={inactivos} atenuado />
          )}
        </>
      )}
    </div>
  );
}

function GrupoUsuarios({
  titulo,
  usuarios,
  atenuado = false,
}: {
  titulo: string;
  usuarios: Array<{
    id: string;
    nombre: string;
    email: string;
    rol: string;
    activo: boolean;
    createdAt: Date;
  }>;
  atenuado?: boolean;
}) {
  if (usuarios.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-panel border border-masa-200 bg-white">
      <h3 className="border-b border-masa-200 bg-masa-50 px-5 py-3 font-bold text-corteza-900">
        {titulo}{" "}
        <span className="ml-1 text-sm font-normal text-corteza-400">({usuarios.length})</span>
      </h3>
      <ul className="divide-y divide-masa-100">
        {usuarios.map((u) => (
          <li
            key={u.id}
            className={`px-5 py-4 ${atenuado ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-semibold ${atenuado ? "text-corteza-400" : "text-corteza-900"}`}>
                    {u.nombre}
                  </p>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.activo
                        ? "bg-cuadre-ok/10 text-cuadre-ok"
                        : "bg-corteza-100 text-corteza-400"
                    }`}
                  >
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                  <span className="rounded-full bg-masa-100 px-2 py-0.5 text-xs font-semibold text-corteza-600">
                    {ROL_LEGIBLE[u.rol] ?? u.rol}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-corteza-500">{u.email}</p>
                <p className="mt-0.5 text-xs text-corteza-400">
                  Creado el {formatearFecha(u.createdAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FormEditarUsuario
                  usuario={{ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol }}
                />
                <FormResetPassword usuarioId={u.id} nombreUsuario={u.nombre} />
                <BtnCambiarEstado
                  usuarioId={u.id}
                  nombreUsuario={u.nombre}
                  activo={u.activo}
                />
              </div>
            </div>

            {/* Formularios de editar/reset se expanden inline debajo del usuario */}
          </li>
        ))}
      </ul>
    </section>
  );
}
