-- AlterEnum
ALTER TYPE "OrigenTransferencia" ADD VALUE 'QR';

-- AlterTable
ALTER TABLE "TransferenciaTurno" ADD COLUMN     "beneficiario" TEXT,
ADD COLUMN     "qrCrudo" TEXT,
ADD COLUMN     "registradaPorId" TEXT;

-- CreateIndex
CREATE INDEX "TransferenciaTurno_registradaPorId_idx" ON "TransferenciaTurno"("registradaPorId");

-- AddForeignKey
ALTER TABLE "TransferenciaTurno" ADD CONSTRAINT "TransferenciaTurno_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
