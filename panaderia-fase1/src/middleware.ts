import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Protección de rutas por sesión y rol (corre en Edge, sin Prisma)
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
