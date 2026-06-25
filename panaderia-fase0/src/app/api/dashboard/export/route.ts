import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.rol !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";
  const filtroSucursal = searchParams.get("sucursal") ?? "";

  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan los parámetros desde y hasta." }, { status: 400 });
  }

  const desdeDate = new Date(desde + "T00:00:00-05:00");
  const hastaDate = new Date(hasta + "T23:59:59-05:00");
  const sucursalWhere = filtroSucursal ? { sucursalId: filtroSucursal } : {};

  const ventas = await prisma.ventaCalculada.findMany({
    where: { fecha: { gte: desdeDate, lte: hastaDate }, ...sucursalWhere },
    include: {
      producto: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
    },
    orderBy: [{ fecha: "asc" }, { sucursalId: "asc" }],
  });

  const fmtFecha = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const cabecera = ["Fecha", "Sucursal", "Turno", "Producto", "Cantidad", "Valor ($)"];
  const filas = ventas.map((v) => [
    fmtFecha.format(v.fecha),
    (v.sucursal as { nombre: string }).nombre,
    v.tipoTurno === "T1_06_14" ? "T1 06-14" : "T2 14-22",
    (v.producto as { nombre: string }).nombre,
    String(v.cantidad),
    Number(v.valor).toFixed(2),
  ]);

  const csv = [cabecera, ...filas]
    .map((fila) => fila.map(escape).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${desde}-${hasta}.csv"`,
    },
  });
}
