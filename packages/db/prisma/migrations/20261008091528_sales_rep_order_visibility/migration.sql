BEGIN;

-- CreateEnum
CREATE TYPE "SalesRepOrderVisibility" AS ENUM ('OWN_SALES', 'ALL_STORE_ORDERS');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "salesRepOrderVisibility" "SalesRepOrderVisibility" NOT NULL DEFAULT 'OWN_SALES',
ADD COLUMN     "salesRepOrderVisibilityReviewedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "salesRepOrderVisibilityUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "salesRepOrderVisibilityUpdatedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "CommercialOrder_tenantId_storeId_createdByUserId_createdAt_idx" ON "CommercialOrder"("tenantId", "storeId", "createdByUserId", "createdAt");

-- Preserve existing Stores; new Stores retain OWN_SALES and need no legacy review.
UPDATE "Store" SET "salesRepOrderVisibility" = 'ALL_STORE_ORDERS', "salesRepOrderVisibilityReviewedAt" = NULL;

COMMIT;
