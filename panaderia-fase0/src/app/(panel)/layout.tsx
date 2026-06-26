import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

const NAV: Array<{ href: string; etiqueta: string; roles: string[] }> = [
  { href: "/dashboard", etiqueta: "Dashboard", roles: ["ADMIN"] },
  { href: "/produccion", etiqueta: "Producción", roles: ["ADMIN", "PANADERO"] },
  { href: "/caja", etiqueta: "Caja", roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { href: "/facturas", etiqueta: "Facturas", roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { href: "/catalogo", etiqueta: "Catálogo", roles: ["ADMIN"] },
  { href: "/precios", etiqueta: "Precios", roles: ["PANADERO", "ATENCION_CLIENTE"] },
  { href: "/campanias", etiqueta: "Campañas", roles: ["ADMIN"] },
  { href: "/plan-semanal", etiqueta: "Plan Semanal", roles: ["ADMIN", "PANADERO"] },
  { href: "/chat-ia", etiqueta: "Chat IA", roles: ["ADMIN"] },
];

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const rol = session.user.rol ?? "";
  const enlaces = NAV.filter((n) => n.roles.includes(rol));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-masa-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="block h-4 w-8 rounded-t-full bg-horno-500" />
            <span className="font-bold text-corteza-900">Panadería</span>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="rounded-lg border border-masa-200 px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100">
              Salir
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
          {enlaces.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-corteza-600 hover:bg-masa-100"
            >
              {n.etiqueta}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <p className="mb-4 text-sm text-corteza-400">
          {session.user.name} · {rol.replaceAll("_", " ").toLowerCase()}
        </p>
        {children}
      </main>
    </div>
  );
}
