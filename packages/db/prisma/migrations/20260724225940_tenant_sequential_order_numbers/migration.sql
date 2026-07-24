/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,orderNumber]` on the table `CommercialOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "CommercialOrder_storeId_orderNumber_key";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "lastCommercialOrderSequence" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrder_tenantId_orderNumber_key" ON "CommercialOrder"("tenantId", "orderNumber");
