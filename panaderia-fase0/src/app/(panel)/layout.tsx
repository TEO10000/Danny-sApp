import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

const NAV = [
  { href: "/dashboard",    etiqueta: "Dashboard",    icono: "dashboard",    roles: ["ADMIN"] },
  { href: "/produccion",   etiqueta: "Producción",   icono: "produccion",   roles: ["ADMIN", "PANADERO"] },
  { href: "/caja",         etiqueta: "Caja",         icono: "caja",         roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { href: "/facturas",     etiqueta: "Facturas",     icono: "facturas",     roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { href: "/catalogo",     etiqueta: "Catálogo",     icono: "catalogo",     roles: ["ADMIN"] },
  { href: "/precios",      etiqueta: "Precios",      icono: "precios",      roles: ["PANADERO", "ATENCION_CLIENTE"] },
  { href: "/campanias",    etiqueta: "Campañas",     icono: "campanias",    roles: ["ADMIN"] },
  { href: "/plan-semanal", etiqueta: "Plan Semanal", icono: "plan-semanal", roles: ["ADMIN", "PANADERO"] },
  { href: "/chat-ia",      etiqueta: "Chat IA",      icono: "chat-ia",      roles: ["ADMIN"] },
] as const;

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const rol = session.user.rol ?? "";
  const enlaces = NAV.filter((n) =>
    (n.roles as readonly string[]).includes(rol)
  ).map(({ roles: _r, ...rest }) => rest);
  const rolLegible = rol.replaceAll("_", " ").toLowerCase();

  const accionSalir = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="md:flex min-h-dvh">
      <Sidebar
        enlaces={enlaces}
        nombreUsuario={session.user.name ?? ""}
        rolLegible={rolLegible}
      >
        <form action={accionSalir}>
          <button className="w-full rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100">
            Salir
          </button>
        </form>
      </Sidebar>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
