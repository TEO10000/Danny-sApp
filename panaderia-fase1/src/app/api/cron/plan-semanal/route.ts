import { NextResponse } from "next/server";

// Vercel Cron lo invoca cada domingo 11:00 UTC = 06:00 America/Guayaquil.
// La generación real del plan con la API de Claude se implementa en la Fase 5.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    mensaje: "Cron activo. El plan semanal con IA se implementa en la Fase 5.",
  });
}
