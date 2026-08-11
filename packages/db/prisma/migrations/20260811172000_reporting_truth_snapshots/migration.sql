-- AlterTable
ALTER TABLE "CatalogSourceLineLink" ADD COLUMN     "resolutionCapturedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommerceQuoteLine" ADD COLUMN     "catalogPriceEvaluationAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommercialOrder" ADD COLUMN     "completedAt" TIMESTAMP(3);
