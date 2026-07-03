-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('SUGERIDA', 'CONFIRMADA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "OrigenTransferencia" AS ENUM ('CORREO', 'MANUAL');

-- AlterTable
ALTER TABLE "CierreTurno" ADD COLUMN     "totalTransferencias" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TransferenciaTurno" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "cierreTurnoId" TEXT,
    "monto" DECIMAL(10,2) NOT NULL,
    "referencia" TEXT,
    "remitente" TEXT,
    "hora" TIMESTAMP(3),
    "messageId" TEXT,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'SUGERIDA',
    "origen" "OrigenTransferencia" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferenciaTurno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaTurno_messageId_key" ON "TransferenciaTurno"("messageId");

-- CreateIndex
CREATE INDEX "TransferenciaTurno_sucursalId_estado_idx" ON "TransferenciaTurno"("sucursalId", "estado");

-- CreateIndex
CREATE INDEX "TransferenciaTurno_cierreTurnoId_idx" ON "TransferenciaTurno"("cierreTurnoId");

-- AddForeignKey
ALTER TABLE "TransferenciaTurno" ADD CONSTRAINT "TransferenciaTurno_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaTurno" ADD CONSTRAINT "TransferenciaTurno_cierreTurnoId_fkey" FOREIGN KEY ("cierreTurnoId") REFERENCES "CierreTurno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
