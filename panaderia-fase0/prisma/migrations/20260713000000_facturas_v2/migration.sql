-- AlterTable CompraInsumo: extend costoUnitario precision; add descuento and tarifaIva
ALTER TABLE "CompraInsumo"
  ALTER COLUMN "costoUnitario" TYPE DECIMAL(12,5),
  ADD COLUMN     "descuento"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "tarifaIva"  INTEGER       NOT NULL DEFAULT 0;

-- AlterTable FacturaProveedor: add descuentoGlobal, ice, irbp, otros
ALTER TABLE "FacturaProveedor"
  ADD COLUMN     "descuentoGlobal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "ice"             DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "irbp"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "otros"           DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill: líneas cuyas facturas tenían aplicaIva=true pasan a tarifaIva=15
UPDATE "CompraInsumo" ci
SET "tarifaIva" = 15
FROM "FacturaProveedor" fp
WHERE ci."facturaId" = fp.id AND fp."aplicaIva" = true;
