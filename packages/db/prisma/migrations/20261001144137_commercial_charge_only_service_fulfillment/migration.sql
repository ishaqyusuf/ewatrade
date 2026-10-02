/*
  Warnings:

  - A unique constraint covering the columns `[orderId,id]` on the table `CommercialOrderLine` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "OfferingSnapshot" ADD COLUMN     "serviceAuthorizationPolicy" "WorkAuthorizationPolicy",
ADD COLUMN     "serviceWorkPolicy" "ServiceWorkPolicy";

-- CreateTable
CREATE TABLE "CommercialServiceFulfillment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialServiceFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercialServiceFulfillment_orderLineId_key" ON "CommercialServiceFulfillment"("orderLineId");

-- CreateIndex
CREATE INDEX "CommercialServiceFulfillment_orderId_performedAt_idx" ON "CommercialServiceFulfillment"("orderId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialServiceFulfillment_tenantId_clientOperationId_key" ON "CommercialServiceFulfillment"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialServiceFulfillment_orderId_orderLineId_key" ON "CommercialServiceFulfillment"("orderId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderLine_orderId_id_key" ON "CommercialOrderLine"("orderId", "id");

-- AddForeignKey
ALTER TABLE "CommercialServiceFulfillment" ADD CONSTRAINT "CommercialServiceFulfillment_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialServiceFulfillment" ADD CONSTRAINT "CommercialServiceFulfillment_orderId_orderLineId_fkey" FOREIGN KEY ("orderId", "orderLineId") REFERENCES "CommercialOrderLine"("orderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
