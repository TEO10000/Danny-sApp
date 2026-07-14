import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizarDecimal } from "@/lib/decimales";

const MODELO_IA = "claude-sonnet-4-6";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Preprocess numérico tolerante: convierte strings con coma a número
const zNumIA = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isNaN(v) ? null : v;
    const n = normalizarDecimal(String(v), 5);
    return n;
  },
  z.number().nullable().optional()
);

const esquemaIA = z.object({
  proveedorNombre: z.string().nullable().optional(),
  ruc: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  lineas: z.array(
    z.object({
      descripcion: z.string(),
      cantidad: zNumIA,
      unidad: z.string().nullable().optional(),
      precioUnitario: zNumIA,
      descuento: zNumIA,
      valorTotal: zNumIA,
      tarifaIva: z.preprocess(
        (v) => (v === null || v === undefined ? null : Number(v)),
        z.union([z.literal(0), z.literal(15), z.null()])
      ).optional(),
      confianza: z.number().min(0).max(1).optional().default(1),
    })
  ),
  totalesImpresos: z.object({
    base0: zNumIA,
    base15: zNumIA,
    descuento: zNumIA,
    subtotal: zNumIA,
    iva: zNumIA,
    ice: zNumIA,
    irbp: zNumIA,
    otros: zNumIA,
    total: zNumIA,
  }).optional(),
  camposDudosos: z.array(z.string()).optional().default([]),
  observaciones: z.string().nullable().optional(),
});

type DatosIA = z.infer<typeof esquemaIA>;

const PROMPT = `Eres un asistente contable ecuatoriano experto en facturas de proveedores. Analiza la(s) imagen(es) — si hay varias, son páginas de UNA MISMA factura — y responde ÚNICAMENTE con este JSON, sin markdown ni explicaciones:
{
  "proveedorNombre": string|null, "ruc": string|null, "numero": string|null, "fecha": "YYYY-MM-DD"|null,
  "lineas": [{ "descripcion": string, "cantidad": number, "unidad": string|null, "precioUnitario": number|null, "descuento": number, "valorTotal": number, "tarifaIva": 0|15|null, "confianza": number }],
  "totalesImpresos": { "base0": number|null, "base15": number|null, "descuento": number|null, "subtotal": number|null, "iva": number|null, "ice": number|null, "irbp": number|null, "otros": number|null, "total": number|null },
  "camposDudosos": [string], "observaciones": string|null
}
Reglas:
- Los decimales pueden venir con coma o punto ($1,3000 = 1.3000). Responde siempre con punto y sin separador de miles ni símbolos.
- Los precios unitarios suelen tener 4 o 5 decimales (ej. 4.73913): consérvalos tal cual.
- IGNORA todo lo escrito a mano (números a esfero encima de la factura no son datos de la factura).
- Las bonificaciones y promociones son líneas válidas con valorTotal 0 (ej. "0/6", descuento del 100%, packs "7+1").
- "valorTotal" de línea es el valor impreso de esa línea, ya neto de su descuento. "descuento" es el descuento de esa línea (0 si no hay columna o está vacía).
- "tarifaIva" por línea: usa las marcas de la factura (asteriscos como ***, columnas o secciones por tarifa, leyendas). Si no puedes determinarla para una línea, usa null y agrégala a camposDudosos.
- Extrae los totales IMPRESOS tal cual: BASE 0%, BASE 15% (o BASE IMPONIBLE), DESCUENTO, SUBTOTAL, IVA, ICE, I.R.B.P. (impuesto a botellas plásticas), otros cargos (ej. COMPENS.2%) y el TOTAL/A PAGAR/VENTA TOTAL. Los que no aparezcan: null.
- Si hay varias páginas, las líneas salen de todas y los totales de la página que los imprima (normalmente la última).
- "confianza" de 0 a 1 por línea. Si la factura está borrosa, manuscrita o dudas de un valor: baja la confianza y usa camposDudosos. NUNCA inventes números.
- La fecha en formato YYYY-MM-DD (fecha de emisión).`;

// Inferencia greedy del subconjunto de líneas con tarifaIva=null que mejor aproxima base15
function inferirTarifas15(
  lineasDudosas: Array<{ idx: number; valorTotal: number }>,
  base15Objetivo: number,
  tolerancia = 0.05
): Set<number> {
  const sorted = [...lineasDudosas].sort((a, b) => b.valorTotal - a.valorTotal);
  const seleccionados = new Set<number>();
  let suma = 0;
  for (const l of sorted) {
    if (suma + l.valorTotal <= base15Objetivo + tolerancia) {
      seleccionados.add(l.idx);
      suma = Math.round((suma + l.valorTotal) * 100) / 100;
    }
  }
  if (Math.abs(suma - base15Objetivo) > tolerancia) return new Set();
  return seleccionados;
}

export async function POST(request: Request) {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "ATENCION_CLIENTE")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── Leer hasta 4 imágenes del multipart ──────────────────────────────────
  const bloques: Anthropic.MessageParam["content"] = [];
  let archivosLeidos = 0;
  try {
    const fd = await request.formData();
    const tiposPermitidos = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];

    for (let i = 0; i < 4; i++) {
      const archivo = fd.get(`archivo_${i}`) as File | null;
      if (!archivo) break;
      if (!tiposPermitidos.includes(archivo.type)) continue;
      const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
      if (archivo.type === "application/pdf") {
        bloques.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as unknown as Anthropic.ImageBlockParam);
      } else {
        bloques.push({
          type: "image",
          source: {
            type: "base64",
            media_type: archivo.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: base64,
          },
        } as Anthropic.ImageBlockParam);
      }
      archivosLeidos++;
    }
    if (archivosLeidos === 0) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
  }

  // ── Llamar a Claude ───────────────────────────────────────────────────────
  let extractado: DatosIA;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const respuesta = await anthropic.messages.create({
      model: MODELO_IA,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [...bloques, { type: "text", text: PROMPT }],
        },
      ],
    });

    const texto = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";
    const jsonLimpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const crudo = JSON.parse(jsonLimpio);
    const validado = esquemaIA.safeParse(crudo);
    if (!validado.success) {
      return NextResponse.json(
        { error: "La IA devolvió datos incompletos. Registra la factura manualmente." },
        { status: 422 }
      );
    }
    extractado = validado.data;
  } catch {
    return NextResponse.json(
      { error: "No pudimos leer la factura. Regístrala manualmente abajo." },
      { status: 502 }
    );
  }

  // ── Post-proceso: inferir tarifaIva de líneas dudosas si base15 está presente ──
  const ti = extractado.totalesImpresos;
  const base15Impresa = ti?.base15 ?? null;
  if (base15Impresa != null && base15Impresa > 0) {
    const lineasNull = extractado.lineas
      .map((l, idx) => ({ idx, valorTotal: l.valorTotal ?? 0, tarifaIva: l.tarifaIva }))
      .filter((l) => l.tarifaIva === null || l.tarifaIva === undefined);

    if (lineasNull.length > 0) {
      const inferidas = inferirTarifas15(lineasNull, base15Impresa);
      extractado = {
        ...extractado,
        lineas: extractado.lineas.map((l, idx) => ({
          ...l,
          tarifaIva:
            lineasNull.find((n) => n.idx === idx)
              ? inferidas.has(idx) ? 15 : null
              : l.tarifaIva,
        })),
      };
    }
  }

  // ── Mapear a entidades existentes ─────────────────────────────────────────
  const [proveedores, insumos] = await Promise.all([
    prisma.proveedor.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    prisma.insumo.findMany({ select: { id: true, nombre: true, unidadMedida: true } }),
  ]);

  let proveedorId: string | undefined;
  let proveedorNuevo: { nombre: string } | undefined;
  if (extractado.proveedorNombre) {
    const normBuscado = norm(extractado.proveedorNombre);
    const encontrado = proveedores.find((p) => {
      const n = norm(p.nombre);
      return n.includes(normBuscado) || normBuscado.includes(n);
    });
    if (encontrado) proveedorId = encontrado.id;
    else proveedorNuevo = { nombre: extractado.proveedorNombre };
  }

  const lineas = extractado.lineas.map((l) => {
    const normDesc = norm(l.descripcion);
    const encontrado = insumos.find((i) => {
      const n = norm(i.nombre);
      return n.includes(normDesc) || normDesc.includes(n);
    });
    const tarifaIva = (l.tarifaIva === 15 ? 15 : l.tarifaIva === 0 ? 0 : null) as 0 | 15 | null;
    const base = {
      cantidad: l.cantidad ?? 1,
      costoTotal: l.valorTotal ?? 0,
      descuento: l.descuento ?? 0,
      tarifaIva,
      costoUnitario: l.precioUnitario ?? undefined,
      confianza: l.confianza ?? 1,
    };
    if (encontrado) return { insumoId: encontrado.id, ...base };
    return { insumoNuevo: { nombre: l.descripcion, unidadMedida: l.unidad ?? "unidad" }, ...base };
  });

  // ── Registrar auditoría ConsultaIA ────────────────────────────────────────
  try {
    await prisma.consultaIA.create({
      data: {
        userId: session.user!.id!,
        tipo: "ESCANEO_FACTURA",
        entrada: `Factura #${extractado.numero ?? "s/n"} — ${extractado.proveedorNombre ?? "proveedor desconocido"} (${archivosLeidos} pág.)`,
        respuesta: JSON.stringify(extractado),
      },
    });
  } catch {
    // No bloquear el flujo si falla el registro
  }

  return NextResponse.json({
    proveedorId,
    proveedorNuevo,
    fecha: extractado.fecha ?? undefined,
    numero: extractado.numero ?? undefined,
    descuentoGlobal: ti?.descuento ?? undefined,
    ice: ti?.ice ?? undefined,
    irbp: ti?.irbp ?? undefined,
    otros: ti?.otros ?? undefined,
    totalesImpresos: ti ?? undefined,
    camposDudosos: extractado.camposDudosos ?? [],
    lineas,
    crudo: extractado,
  });
}
