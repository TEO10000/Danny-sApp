import type { NextAuthConfig } from "next-auth";

export const RUTA_POR_ROL: Record<string, string> = {
  ADMIN: "/dashboard",
  PANADERO: "/produccion",
  ATENCION_CLIENTE: "/caja",
};

// Qué roles pueden entrar a cada sección
const PERMISOS: Array<{ prefijo: string; roles: string[] }> = [
  { prefijo: "/dashboard", roles: ["ADMIN"] },
  { prefijo: "/catalogo", roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { prefijo: "/precios", roles: ["ADMIN", "PANADERO", "ATENCION_CLIENTE"] },
  { prefijo: "/produccion", roles: ["ADMIN", "PANADERO"] },
  { prefijo: "/caja", roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { prefijo: "/facturas", roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { prefijo: "/transferencias", roles: ["ADMIN", "ATENCION_CLIENTE"] },
  { prefijo: "/usuarios", roles: ["ADMIN"] },
];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 horas (RF-01.5)
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.rol = (user as { rol?: string }).rol;
        token.id = (user as { id?: string }).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.rol = token.rol as string;
        session.user.id = token.id as string;
      }
      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const sesion = auth?.user;

      const esPublica = pathname.startsWith("/login") || pathname.startsWith("/api/auth");
      if (esPublica) {
        if (sesion && pathname.startsWith("/login")) {
          const destino = RUTA_POR_ROL[sesion.rol ?? ""] ?? "/login";
          return Response.redirect(new URL(destino, request.nextUrl));
        }
        return true;
      }

      // El cron se protege con CRON_SECRET, no con sesión
      if (pathname.startsWith("/api/cron")) return true;

      if (!sesion) return false; // redirige a /login

      const regla = PERMISOS.find((p) => pathname.startsWith(p.prefijo));
      if (regla && !regla.roles.includes(sesion.rol ?? "")) {
        const destino = RUTA_POR_ROL[sesion.rol ?? ""] ?? "/login";
        return Response.redirect(new URL(destino, request.nextUrl));
      }
      return true;
    },
  },
  providers: [], // se agregan en auth.ts (necesitan Node/Prisma)
} satisfies NextAuthConfig;
