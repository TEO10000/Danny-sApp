-- AlterTable
ALTER TABLE "FacturaProveedor" ADD COLUMN     "aplicaIva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iva" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill: facturas históricas sin IVA → subtotal = montoTotal (iva=0, total no cambia)
UPDATE "FacturaProveedor" SET "subtotal" = "montoTotal";
