import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RUTA_POR_ROL } from "@/lib/auth.config";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(RUTA_POR_ROL[session.user.rol ?? ""] ?? "/login");
}
