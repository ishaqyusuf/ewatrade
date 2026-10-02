/*
  Warnings:

  - A unique constraint covering the columns `[productReturnCostId]` on the table `FinanceInventoryValuationEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,bookId,id]` on the table `FinanceInventoryValuationEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,bookId,productReturnCostId]` on the table `FinanceInventoryValuationEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderLineId,id]` on the table `ProductFulfillment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,orderLineId,id]` on the table `ProductReturn` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FinanceInventoryUnknownReason" ADD VALUE 'MISSING_ISSUE_COST';
ALTER TYPE "FinanceInventoryUnknownReason" ADD VALUE 'UNCAPTURED_RETURNS';

-- AlterTable
ALTER TABLE "FinanceInventoryValuationEvent" ADD COLUMN     "productReturnCostId" TEXT;

-- CreateTable
CREATE TABLE "FinanceProductReturnCost" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "productReturnId" TEXT NOT NULL,
    "canonicalQuantity" DECIMAL(38,18) NOT NULL,
    "sourceCostMinor" BIGINT,
    "unknownReason" "FinanceInventoryUnknownReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceProductReturnCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceProductReturnCostAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "returnCostId" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "originalIssueId" TEXT,
    "canonicalQuantity" DECIMAL(38,18) NOT NULL,
    "remainingQuantityBefore" DECIMAL(38,18) NOT NULL,
    "remainingQuantityAfter" DECIMAL(38,18) NOT NULL,
    "sourceCostMinor" BIGINT,
    "remainingCostBeforeMinor" BIGINT,
    "remainingCostAfterMinor" BIGINT,
    "unknownReason" "FinanceInventoryUnknownReason",

    CONSTRAINT "FinanceProductReturnCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProductReturnCost_productReturnId_key" ON "FinanceProductReturnCost"("productReturnId");

-- CreateIndex
CREATE INDEX "FinanceProductReturnCost_bookId_orderLineId_idx" ON "FinanceProductReturnCost"("bookId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProductReturnCost_tenantId_bookId_id_key" ON "FinanceProductReturnCost"("tenantId", "bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProductReturnCost_tenantId_orderLineId_productReturn_key" ON "FinanceProductReturnCost"("tenantId", "orderLineId", "productReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProductReturnCost_tenantId_bookId_orderLineId_id_key" ON "FinanceProductReturnCost"("tenantId", "bookId", "orderLineId", "id");

-- CreateIndex
CREATE INDEX "FinanceProductReturnCostAllocation_bookId_fulfillmentId_idx" ON "FinanceProductReturnCostAllocation"("bookId", "fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceProductReturnCostAllocation_returnCostId_fulfillment_key" ON "FinanceProductReturnCostAllocation"("returnCostId", "fulfillmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_productReturnCostId_key" ON "FinanceInventoryValuationEvent"("productReturnCostId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_tenantId_bookId_id_key" ON "FinanceInventoryValuationEvent"("tenantId", "bookId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_tenantId_bookId_productRetur_key" ON "FinanceInventoryValuationEvent"("tenantId", "bookId", "productReturnCostId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFulfillment_orderLineId_id_key" ON "ProductFulfillment"("orderLineId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReturn_tenantId_orderLineId_id_key" ON "ProductReturn"("tenantId", "orderLineId", "id");

-- AddForeignKey
ALTER TABLE "FinanceInventoryValuationEvent" ADD CONSTRAINT "FinanceInventoryValuationEvent_tenantId_bookId_productRetu_fkey" FOREIGN KEY ("tenantId", "bookId", "productReturnCostId") REFERENCES "FinanceProductReturnCost"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProductReturnCost" ADD CONSTRAINT "FinanceProductReturnCost_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProductReturnCost" ADD CONSTRAINT "FinanceProductReturnCost_tenantId_orderLineId_productRetur_fkey" FOREIGN KEY ("tenantId", "orderLineId", "productReturnId") REFERENCES "ProductReturn"("tenantId", "orderLineId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProductReturnCostAllocation" ADD CONSTRAINT "FinanceProductReturnCostAllocation_tenantId_bookId_orderLi_fkey" FOREIGN KEY ("tenantId", "bookId", "orderLineId", "returnCostId") REFERENCES "FinanceProductReturnCost"("tenantId", "bookId", "orderLineId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProductReturnCostAllocation" ADD CONSTRAINT "FinanceProductReturnCostAllocation_orderLineId_fulfillment_fkey" FOREIGN KEY ("orderLineId", "fulfillmentId") REFERENCES "ProductFulfillment"("orderLineId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceProductReturnCostAllocation" ADD CONSTRAINT "FinanceProductReturnCostAllocation_tenantId_bookId_origina_fkey" FOREIGN KEY ("tenantId", "bookId", "originalIssueId") REFERENCES "FinanceInventoryValuationEvent"("tenantId", "bookId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
