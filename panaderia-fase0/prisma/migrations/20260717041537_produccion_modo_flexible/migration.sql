-- CreateEnum
CREATE TYPE "ModoProduccion" AS ENUM ('LATAS', 'UNIDADES');

-- AlterTable
ALTER TABLE "DetalleCoche" ADD COLUMN     "agotado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agotadoEn" TIMESTAMP(3),
ADD COLUMN     "cantidadUnidades" INTEGER,
ALTER COLUMN "numLatas" DROP NOT NULL,
ALTER COLUMN "panesPorLata" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "modoProduccion" "ModoProduccion" NOT NULL DEFAULT 'LATAS',
ADD COLUMN     "vidaUtilHoras" INTEGER;
