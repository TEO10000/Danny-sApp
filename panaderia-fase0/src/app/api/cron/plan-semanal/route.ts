import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Vercel Cron lo invoca cada domingo 11:00 UTC = 06:00 America/Guayaquil.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Parámetros opcionales para generación manual desde la UI
  const url = new URL(request.url);
  const paramSucursalId = url.searchParams.get("sucursalId");
  const paramSemanaInicio = url.searchParams.get("semanaInicio");

  // Calcular semanaInicio por defecto: lunes de la semana siguiente
  function calcularLunesSiguiente(): Date {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setUTCDate(hoy.getUTCDate() + 1); // mañana = lunes cuando corre domingo
    return new Date(lunes.toISOString().slice(0, 10) + "T00:00:00.000Z");
  }

  const semanaInicio = paramSemanaInicio
    ? new Date(paramSemanaInicio + "T00:00:00.000Z")
    : calcularLunesSiguiente();

  const finDeSemana = new Date(semanaInicio.getTime() + 6 * 24 * 60 * 60 * 1000);

  // Sucursales a procesar
  const todasSucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
  });

  const sucursalesAProcesar = paramSucursalId
    ? todasSucursales.filter((s) => s.id === paramSucursalId)
    : todasSucursales;

  // Primer admin activo del sistema (para el registro de ConsultaIA)
  const adminUser = await prisma.user.findFirst({
    where: { rol: "ADMIN", activo: true },
    select: { id: true },
  });

  const hace8semanas = new Date(semanaInicio.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

  // Esquemas Zod para validar respuesta de Claude
  const SchemaProductoPlan = z.object({
    nombre: z.string(),
    latasSugeridas: z.number().int().positive(),
    panesPorLata: z.number().int().positive(),
    totalUnidades: z.number().int().nonnegative(),
    nota: z.string().optional(),
  });
  const SchemaDiaPlan = z.object({
    fecha: z.string(),
    diaSemana: z.string(),
    productos: z.array(SchemaProductoPlan).min(1),
  });
  const SchemaPlan = z.object({
    semana: z.string(),
    sucursal: z.string(),
    patronesDetectados: z.array(z.string()),
    dias: z.array(SchemaDiaPlan).length(7),
  });

  let planesGenerados = 0;

  for (const sucursal of sucursalesAProcesar) {
    const sucursalId = sucursal.id;

    // Si ya existe un plan APROBADO, no regenerar
    const planExistente = await prisma.planSemanal.findUnique({
      where: { semanaInicio_sucursalId: { semanaInicio, sucursalId } },
    });
    if (planExistente?.estado === "APROBADO") {
      continue;
    }

    try {
      // a) Ventas por (dayOfWeek, producto) — promedio últimas 8 semanas
      const ventas8s = await prisma.ventaCalculada.findMany({
        where: { sucursalId, fecha: { gte: hace8semanas } },
        include: { producto: { select: { nombre: true } } },
      });

      type VentaItem = {
        fecha: Date;
        producto: { nombre: string };
        cantidad: number;
      };

      const acumVentas = new Map<string, { total: number; semanas: Set<string> }>();
      for (const v of ventas8s as VentaItem[]) {
        const dia = v.fecha.getUTCDay();
        const clave = `${dia}::${v.producto.nombre}`;
        const sem = v.fecha.toISOString().slice(0, 10);
        const entry = acumVentas.get(clave) ?? { total: 0, semanas: new Set() };
        entry.total += v.cantidad;
        entry.semanas.add(sem);
        acumVentas.set(clave, entry);
      }

      const diasNombre = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const resumenVentasPorDia = [...acumVentas.entries()]
        .map(([clave, val]) => {
          const [diaNum, prod] = clave.split("::");
          const prom = Math.round(val.total / Math.max(val.semanas.size, 1));
          return `${diasNombre[Number(diaNum)]} | ${prod}: ~${prom} unid/día`;
        })
        .join("\n");

      // b) Mermas por producto
      const mermas8s = await prisma.detalleCoche.findMany({
        where: { coche: { sucursalId, fecha: { gte: hace8semanas } } },
        include: { producto: { select: { nombre: true } } },
      });

      type MermaItem = {
        producto: { nombre: string };
        numLatas: number;
        panesPorLata: number;
        mermas: number;
      };

      const acumMermas = new Map<string, { mermas: number; produccion: number }>();
      for (const m of mermas8s as MermaItem[]) {
        const entry = acumMermas.get(m.producto.nombre) ?? { mermas: 0, produccion: 0 };
        entry.mermas += m.mermas;
        entry.produccion += m.numLatas * m.panesPorLata;
        acumMermas.set(m.producto.nombre, entry);
      }

      const resumenMermas = [...acumMermas.entries()]
        .map(([prod, val]) => {
          const ratio = val.produccion > 0 ? Math.round((val.mermas / val.produccion) * 100) : 0;
          return `${prod}: ${ratio}% merma`;
        })
        .join("\n");

      // c) Campañas activas en la semana siguiente
      const campanias = await prisma.campania.findMany({
        where: {
          AND: [
            { fechaInicio: { lte: finDeSemana } },
            { fechaFin: { gte: semanaInicio } },
            { OR: [{ sucursalId }, { sucursalId: null }] },
          ],
        },
        include: {
          productos: { include: { producto: { select: { nombre: true } } } },
        },
      });

      type CampaniaItem = {
        nombre: string;
        productos: Array<{ producto: { nombre: string } }>;
      };

      const resumenCampanias =
        (campanias as CampaniaItem[])
          .map(
            (c) =>
              `${c.nombre}: ${c.productos.map((cp) => cp.producto.nombre).join(", ")}`
          )
          .join("\n") || "Ninguna";

      const fechaLunes = semanaInicio.toISOString().slice(0, 10);
      const fechaDomingo = finDeSemana.toISOString().slice(0, 10);

      const promptSistema = `Eres un asistente de planificación para una panadería ecuatoriana llamada Danny's.
Tu tarea es generar un plan de producción semanal en formato JSON.
Responde ÚNICAMENTE con el JSON, sin texto adicional, sin markdown ni bloques de código.`;

      const promptUsuario = `
Sucursal: ${sucursal.nombre}
Semana del ${fechaLunes} al ${fechaDomingo}

VENTAS PROMEDIO POR DÍA DE SEMANA (últimas 8 semanas):
${resumenVentasPorDia || "Sin datos de ventas previas."}

RATIO DE MERMAS POR PRODUCTO:
${resumenMermas || "Sin datos de mermas previas."}

CAMPAÑAS ACTIVAS ESTA SEMANA:
${resumenCampanias}

Genera un plan de producción para cada día de la semana (lunes a domingo).
Para cada día indica los productos a hornear con cantidad sugerida de latas y panes por lata.
Considera un margen extra del 10% sobre el promedio de ventas para evitar quedarse sin stock.
Si hay campaña activa, aumenta la producción de los productos involucrados un 20%.

Devuelve SOLO este JSON (sin nada más):
{
  "semana": "YYYY-MM-DD al YYYY-MM-DD",
  "sucursal": "nombre",
  "patronesDetectados": ["patrón 1", "patrón 2"],
  "dias": [
    {
      "fecha": "YYYY-MM-DD",
      "diaSemana": "Lunes",
      "productos": [
        {
          "nombre": "nombre del producto",
          "latasSugeridas": número,
          "panesPorLata": número,
          "totalUnidades": número,
          "nota": "opcional"
        }
      ]
    }
  ]
}`;

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const respuesta = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: promptSistema,
        messages: [{ role: "user", content: promptUsuario }],
      });

      const textoRespuesta =
        respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";

      const jsonLimpio = textoRespuesta
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      let planValidado: z.infer<typeof SchemaPlan>;
      try {
        const crudo = JSON.parse(jsonLimpio);
        const validado = SchemaPlan.safeParse(crudo);
        if (!validado.success) {
          throw new Error(validado.error.errors[0].message);
        }
        planValidado = validado.data;
      } catch (err) {
        const mensajeError = err instanceof Error ? err.message : "JSON inválido";
        if (adminUser) {
          await prisma.consultaIA.create({
            data: {
              userId: adminUser.id,
              tipo: "PLAN_SEMANAL",
              entrada: `Error al validar plan para ${sucursal.nombre} semana ${fechaLunes}`,
              respuesta: `Error: ${mensajeError}\n\nRespuesta cruda: ${textoRespuesta.slice(0, 500)}`,
            },
          });
        }
        continue;
      }

      // Guardar plan con upsert
      await prisma.planSemanal.upsert({
        where: { semanaInicio_sucursalId: { semanaInicio, sucursalId } },
        create: {
          semanaInicio,
          sucursalId,
          estado: "BORRADOR",
          generadoPorIa: true,
          contenidoJson: planValidado as object,
        },
        update: {
          contenidoJson: planValidado as object,
          estado: "BORRADOR",
          generadoPorIa: true,
          aprobadoPorId: null,
        },
      });

      // Registrar en ConsultaIA
      if (adminUser) {
        await prisma.consultaIA.create({
          data: {
            userId: adminUser.id,
            tipo: "PLAN_SEMANAL",
            entrada: `Plan semanal ${sucursal.nombre} — semana ${fechaLunes}\nVentas:\n${resumenVentasPorDia}\nMermas:\n${resumenMermas}`,
            respuesta: JSON.stringify(planValidado),
          },
        });
      }

      planesGenerados++;
    } catch (err) {
      // Continúa con la siguiente sucursal sin romper el cron
      const mensajeErr = err instanceof Error ? err.message : "Error desconocido";
      if (adminUser) {
        await prisma.consultaIA.create({
          data: {
            userId: adminUser.id,
            tipo: "PLAN_SEMANAL",
            entrada: `Error en cron para ${sucursal.nombre} semana ${semanaInicio.toISOString().slice(0, 10)}`,
            respuesta: `Error: ${mensajeErr}`,
          },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, planesGenerados });
}
