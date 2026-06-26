import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let pregunta: string;
  try {
    const body = (await request.json()) as { pregunta?: unknown };
    if (typeof body.pregunta !== "string" || !body.pregunta.trim()) {
      return NextResponse.json({ error: "La pregunta es requerida." }, { status: 400 });
    }
    pregunta = body.pregunta.trim();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [ventasGrupo, cierresAgr, facturasPendientes, campanias, productos] = await Promise.all([
    prisma.ventaCalculada.groupBy({
      by: ["productoId"],
      where: { fecha: { gte: hace30dias } },
      _sum: { valor: true, cantidad: true },
    }),
    prisma.cierreTurno.aggregate({
      where: { fecha: { gte: hace30dias } },
      _sum: { descuadre: true },
      _count: { id: true },
    }),
    prisma.facturaProveedor.aggregate({
      where: { estado: "PENDIENTE" },
      _sum: { montoTotal: true },
      _count: { id: true },
    }),
    prisma.campania.findMany({
      where: {
        fechaInicio: { lte: new Date() },
        fechaFin: { gte: new Date() },
      },
      select: { nombre: true, fechaInicio: true, fechaFin: true },
    }),
    prisma.producto.findMany({ select: { id: true, nombre: true } }),
  ]);

  const mapaNombres = new Map(productos.map((p) => [p.id, p.nombre]));

  type VentaGrupo = {
    productoId: string;
    _sum: { valor: unknown; cantidad: unknown };
  };

  const ventasResumen = (ventasGrupo as VentaGrupo[])
    .map((v) => ({
      producto: mapaNombres.get(v.productoId) ?? v.productoId,
      totalVentas: Math.round(Number(v._sum.valor ?? 0) * 100) / 100,
      totalUnidades: Number(v._sum.cantidad ?? 0),
    }))
    .sort((a, b) => b.totalVentas - a.totalVentas)
    .slice(0, 15);

  const fmtFecha = new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "America/Guayaquil",
  });

  const contextoJSON = JSON.stringify(
    {
      periodo: "últimos 30 días",
      ventas: ventasResumen,
      caja: {
        turnosCerrados: Number(cierresAgr._count.id ?? 0),
        descuadreTotal: Math.round(Number(cierresAgr._sum.descuadre ?? 0) * 100) / 100,
      },
      facturasPendientes: {
        cantidad: Number(facturasPendientes._count.id ?? 0),
        montoTotal: Math.round(Number(facturasPendientes._sum.montoTotal ?? 0) * 100) / 100,
      },
      campaniasActivas: campanias.map((c) => ({
        nombre: c.nombre,
        inicio: fmtFecha.format(c.fechaInicio),
        fin: fmtFecha.format(c.fechaFin),
      })),
    },
    null,
    2
  );

  let respuestaTexto: string;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const respuesta = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `Eres el asistente interno de Danny's Panadería.
Tienes acceso a los datos del negocio de los últimos 30 días.
Responde en español, de forma clara y concisa.
No inventes datos; si no tienes la información, dilo.

RESUMEN DEL NEGOCIO (últimos 30 días):
${contextoJSON}`,
      messages: [{ role: "user", content: pregunta }],
    });

    respuestaTexto =
      respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "Sin respuesta.";
  } catch {
    return NextResponse.json(
      { error: "No pudimos procesar la consulta. Intenta de nuevo." },
      { status: 502 }
    );
  }

  try {
    await prisma.consultaIA.create({
      data: {
        userId: session.user.id,
        tipo: "CHAT",
        entrada: pregunta,
        respuesta: respuestaTexto,
      },
    });
  } catch {
    // No bloquear si falla el registro de auditoría
  }

  return NextResponse.json({ respuesta: respuestaTexto });
}
