-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'PANADERO', 'ATENCION_CLIENTE');

-- CreateEnum
CREATE TYPE "CategoriaProducto" AS ENUM ('PAN_SAL', 'PAN_DULCE', 'PASTELERIA', 'GALLETERIA', 'EMPAQUETADO');

-- CreateEnum
CREATE TYPE "TipoTurno" AS ENUM ('T1_06_14', 'T2_14_22');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('PENDIENTE', 'PAGADA', 'PAGO_PARCIAL', 'ANULADA');

-- CreateEnum
CREATE TYPE "OrigenRegistroFactura" AS ENUM ('MANUAL', 'ESCANEO_IA');

-- CreateEnum
CREATE TYPE "OrigenPago" AS ENUM ('CAJA_TURNO', 'JEFE');

-- CreateEnum
CREATE TYPE "EstadoPlan" AS ENUM ('BORRADOR', 'APROBADO');

-- CreateEnum
CREATE TYPE "TipoConsultaIA" AS ENUM ('CHAT', 'ESCANEO_FACTURA', 'PLAN_SEMANAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaProducto" NOT NULL,
    "codigoBarras" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioProducto" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidadMedida" TEXT NOT NULL,
    "codigoBarras" TEXT,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaProveedor" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "numero" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "montoTotal" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'PENDIENTE',
    "origenRegistro" "OrigenRegistroFactura" NOT NULL DEFAULT 'MANUAL',
    "imagenUrl" TEXT,
    "datosIaJson" JSONB,
    "registradaPorId" TEXT NOT NULL,
    "pagadaPorId" TEXT,
    "fechaPago" TIMESTAMP(3),
    "origenPago" "OrigenPago",
    "cierreTurnoId" TEXT,

    CONSTRAINT "FacturaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraInsumo" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "costoTotal" DECIMAL(10,2) NOT NULL,
    "costoUnitario" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "CompraInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CocheProduccion" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sucursalId" TEXT NOT NULL,
    "panaderoId" TEXT NOT NULL,
    "notas" TEXT,

    CONSTRAINT "CocheProduccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleCoche" (
    "id" TEXT NOT NULL,
    "cocheId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "numLatas" INTEGER NOT NULL,
    "panesPorLata" INTEGER NOT NULL,
    "mermas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DetalleCoche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreTurno" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipoTurno" "TipoTurno" NOT NULL,
    "empleadaId" TEXT NOT NULL,
    "fondoInicial" DECIMAL(10,2) NOT NULL DEFAULT 40.00,
    "efectivoContado" DECIMAL(10,2) NOT NULL,
    "efectivoEsperado" DECIMAL(10,2) NOT NULL,
    "descuadre" DECIMAL(10,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SobranteTurno" (
    "id" TEXT NOT NULL,
    "cierreTurnoId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidadSobrante" INTEGER NOT NULL,

    CONSTRAINT "SobranteTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaCalculada" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipoTurno" "TipoTurno" NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "VentaCalculada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campania" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "costo" DECIMAL(10,2) NOT NULL,
    "sucursalId" TEXT,

    CONSTRAINT "Campania_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaniaProducto" (
    "campaniaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,

    CONSTRAINT "CampaniaProducto_pkey" PRIMARY KEY ("campaniaId","productoId")
);

-- CreateTable
CREATE TABLE "PlanSemanal" (
    "id" TEXT NOT NULL,
    "semanaInicio" DATE NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "estado" "EstadoPlan" NOT NULL DEFAULT 'BORRADOR',
    "generadoPorIa" BOOLEAN NOT NULL DEFAULT true,
    "contenidoJson" JSONB NOT NULL,
    "aprobadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSemanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaIA" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoConsultaIA" NOT NULL,
    "entrada" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_nombre_key" ON "Sucursal"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigoBarras_key" ON "Producto"("codigoBarras");

-- CreateIndex
CREATE INDEX "Producto_categoria_idx" ON "Producto"("categoria");

-- CreateIndex
CREATE INDEX "PrecioProducto_productoId_vigenteDesde_idx" ON "PrecioProducto"("productoId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_codigoBarras_key" ON "Insumo"("codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_nombre_key" ON "Proveedor"("nombre");

-- CreateIndex
CREATE INDEX "FacturaProveedor_sucursalId_estado_idx" ON "FacturaProveedor"("sucursalId", "estado");

-- CreateIndex
CREATE INDEX "FacturaProveedor_fecha_idx" ON "FacturaProveedor"("fecha");

-- CreateIndex
CREATE INDEX "CompraInsumo_insumoId_idx" ON "CompraInsumo"("insumoId");

-- CreateIndex
CREATE INDEX "CocheProduccion_sucursalId_fecha_idx" ON "CocheProduccion"("sucursalId", "fecha");

-- CreateIndex
CREATE INDEX "CierreTurno_fecha_idx" ON "CierreTurno"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "CierreTurno_sucursalId_fecha_tipoTurno_key" ON "CierreTurno"("sucursalId", "fecha", "tipoTurno");

-- CreateIndex
CREATE UNIQUE INDEX "SobranteTurno_cierreTurnoId_productoId_key" ON "SobranteTurno"("cierreTurnoId", "productoId");

-- CreateIndex
CREATE INDEX "VentaCalculada_fecha_idx" ON "VentaCalculada"("fecha");

-- CreateIndex
CREATE INDEX "VentaCalculada_productoId_fecha_idx" ON "VentaCalculada"("productoId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "VentaCalculada_sucursalId_fecha_tipoTurno_productoId_key" ON "VentaCalculada"("sucursalId", "fecha", "tipoTurno", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSemanal_semanaInicio_sucursalId_key" ON "PlanSemanal"("semanaInicio", "sucursalId");

-- AddForeignKey
ALTER TABLE "PrecioProducto" ADD CONSTRAINT "PrecioProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_pagadaPorId_fkey" FOREIGN KEY ("pagadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaProveedor" ADD CONSTRAINT "FacturaProveedor_cierreTurnoId_fkey" FOREIGN KEY ("cierreTurnoId") REFERENCES "CierreTurno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraInsumo" ADD CONSTRAINT "CompraInsumo_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "FacturaProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraInsumo" ADD CONSTRAINT "CompraInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CocheProduccion" ADD CONSTRAINT "CocheProduccion_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CocheProduccion" ADD CONSTRAINT "CocheProduccion_panaderoId_fkey" FOREIGN KEY ("panaderoId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleCoche" ADD CONSTRAINT "DetalleCoche_cocheId_fkey" FOREIGN KEY ("cocheId") REFERENCES "CocheProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleCoche" ADD CONSTRAINT "DetalleCoche_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreTurno" ADD CONSTRAINT "CierreTurno_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreTurno" ADD CONSTRAINT "CierreTurno_empleadaId_fkey" FOREIGN KEY ("empleadaId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SobranteTurno" ADD CONSTRAINT "SobranteTurno_cierreTurnoId_fkey" FOREIGN KEY ("cierreTurnoId") REFERENCES "CierreTurno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SobranteTurno" ADD CONSTRAINT "SobranteTurno_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCalculada" ADD CONSTRAINT "VentaCalculada_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaCalculada" ADD CONSTRAINT "VentaCalculada_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaniaProducto" ADD CONSTRAINT "CampaniaProducto_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaniaProducto" ADD CONSTRAINT "CampaniaProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSemanal" ADD CONSTRAINT "PlanSemanal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSemanal" ADD CONSTRAINT "PlanSemanal_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaIA" ADD CONSTRAINT "ConsultaIA_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
