-- AlterEnum
ALTER TYPE "OfferingPricingPolicy" ADD VALUE 'ORDER_TOTAL';

-- AlterTable
ALTER TABLE "CommercialOrderLine" ALTER COLUMN "unitPriceMinor" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OfferingSnapshot" ADD COLUMN     "note" TEXT,
ALTER COLUMN "unitPriceMinor" DROP NOT NULL;
