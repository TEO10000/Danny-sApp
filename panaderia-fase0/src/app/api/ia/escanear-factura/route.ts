import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Cambiar aquí si se actualiza el identificador del modelo de visión
const MODELO_IA = "claude-sonnet-4-5";

// Normaliza texto para comparación aproximada (minúsculas, sin tildes ni espacios extremos)
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Esquema de lo que la IA debe devolver (JSON puro)
const esquemaIA = z.object({
  proveedorNombre: z.string().nullable(),
  numero: z.string().nullable(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  lineas: z.array(
    z.object({
      descripcion: z.string(),
      cantidad: z.number(),
      unidad: z.string().nullable(),
      costoTotal: z.number(),
    })
  ),
});

type DatosIA = z.infer<typeof esquemaIA>;

const PROMPT = `Eres un asistente de contabilidad. Analiza esta factura y extrae los datos en JSON puro (sin texto adicional, sin markdown, sin explicaciones).

Responde ÚNICAMENTE con este JSON:
{
  "proveedorNombre": "nombre del vendedor/proveedor o null",
  "numero": "número de la factura o null",
  "fecha": "YYYY-MM-DD o null",
  "lineas": [
    {
      "descripcion": "nombre del producto/insumo",
      "cantidad": número,
      "unidad": "kg, quintal, litro, unidad, etc. o null",
      "costoTotal": número con decimales
    }
  ]
}

Reglas:
- La fecha DEBE estar en formato YYYY-MM-DD. Si no la encuentras, usa null.
- Los números deben ser solo dígitos (sin símbolos de moneda ni separadores de miles).
- costoTotal es el precio total de esa línea (cantidad × precio unitario).
- Si no puedes leer algún campo, usa null.`;

// Recibe multipart/form-data con campo "archivo" (imagen JPG/PNG/WEBP/GIF o PDF)
export async function POST(request: Request) {
  const session = await auth();
  const rol = session?.user?.rol;
  if (!session?.user?.id || (rol !== "ADMIN" && rol !== "ATENCION_CLIENTE")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── Leer archivo ──────────────────────────────────────────────────────────
  let archivoBase64: string;
  let mediaType: string;
  try {
    const fd = await request.formData();
    const archivo = fd.get("archivo") as File | null;
    if (!archivo) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
    const tiposPermitidos = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    if (!tiposPermitidos.includes(archivo.type)) {
      return NextResponse.json(
        { error: "Tipo no permitido. Usa JPG, PNG, WEBP, GIF o PDF." },
        { status: 400 }
      );
    }
    mediaType = archivo.type;
    archivoBase64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
  }

  // ── Llamar a Claude ───────────────────────────────────────────────────────
  let extractado: DatosIA;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Para imágenes usamos ImageBlockParam; para PDF usamos el tipo "document"
    // (PDFBlockParam puede no estar en todos los tipos del SDK; se castea de forma segura)
    const bloqueArchivo =
      mediaType === "application/pdf"
        ? ({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: archivoBase64 },
          } as unknown as Anthropic.ImageBlockParam)
        : ({
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: archivoBase64,
            },
          } as Anthropic.ImageBlockParam);

    const respuesta = await anthropic.messages.create({
      model: MODELO_IA,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [bloqueArchivo, { type: "text", text: PROMPT }],
        },
      ],
    });

    const texto =
      respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";

    // Limpiar posibles fences ```json ... ```
    const jsonLimpio = texto
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

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

  // ── Mapear a entidades existentes ─────────────────────────────────────────
  const [proveedores, insumos] = await Promise.all([
    prisma.proveedor.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
    }),
    prisma.insumo.findMany({ select: { id: true, nombre: true, unidadMedida: true } }),
  ]);

  // Resolver proveedor (coincidencia aproximada case-insensitive sin tildes)
  let proveedorId: string | undefined;
  let proveedorNuevo: { nombre: string } | undefined;
  if (extractado.proveedorNombre) {
    const normBuscado = norm(extractado.proveedorNombre);
    const encontrado = proveedores.find((p) => {
      const n = norm(p.nombre);
      return n.includes(normBuscado) || normBuscado.includes(n);
    });
    if (encontrado) {
      proveedorId = encontrado.id;
    } else {
      proveedorNuevo = { nombre: extractado.proveedorNombre };
    }
  }

  // Resolver insumos por línea
  const lineas = extractado.lineas.map((l) => {
    const normDesc = norm(l.descripcion);
    const encontrado = insumos.find((i) => {
      const n = norm(i.nombre);
      return n.includes(normDesc) || normDesc.includes(n);
    });
    if (encontrado) {
      return { insumoId: encontrado.id, cantidad: l.cantidad, costoTotal: l.costoTotal };
    }
    return {
      insumoNuevo: { nombre: l.descripcion, unidadMedida: l.unidad ?? "unidad" },
      cantidad: l.cantidad,
      costoTotal: l.costoTotal,
    };
  });

  // ── Registrar auditoría ConsultaIA ────────────────────────────────────────
  try {
    await prisma.consultaIA.create({
      data: {
        userId: session.user!.id!,
        tipo: "ESCANEO_FACTURA",
        entrada: `Factura #${extractado.numero ?? "s/n"} — ${
          extractado.proveedorNombre ?? "proveedor desconocido"
        }`,
        respuesta: JSON.stringify(extractado),
      },
    });
  } catch {
    // No bloquear el flujo si falla el registro de auditoría
  }

  // TODO: subir imagen a Vercel Blob y guardar imagenUrl para adjuntarla a la factura
  // import { put } from "@vercel/blob";
  // const blob = await put(`facturas/${Date.now()}`, archivo, { access: "public" });
  // Agregar blob.url al payload como imagenUrl y configurar BLOB_READ_WRITE_TOKEN en Vercel

  return NextResponse.json({
    proveedorId,
    proveedorNuevo,
    fecha: extractado.fecha ?? undefined,
    numero: extractado.numero ?? undefined,
    lineas,
    crudo: extractado,
  });
}
