/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,id]` on the table `StockTransfer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StockTransferAcknowledgmentKind" AS ENUM ('RECEIVE', 'CANCEL');

-- CreateTable
CREATE TABLE "StockTransferAcknowledgment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" "StockTransferAcknowledgmentKind" NOT NULL,
    "acknowledgedByUserId" TEXT NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "remainingBefore" DECIMAL(38,6) NOT NULL,
    "remainingAfter" DECIMAL(38,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockTransferAcknowledgment_tenantId_transferId_effectiveAt_idx" ON "StockTransferAcknowledgment"("tenantId", "transferId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferAcknowledgment_tenantId_operationId_key" ON "StockTransferAcknowledgment"("tenantId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_tenantId_id_key" ON "StockTransfer"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "StockTransferAcknowledgment" ADD CONSTRAINT "StockTransferAcknowledgment_tenantId_transferId_fkey" FOREIGN KEY ("tenantId", "transferId") REFERENCES "StockTransfer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferAcknowledgment" ADD CONSTRAINT "StockTransferAcknowledgment_tenantId_operationId_fkey" FOREIGN KEY ("tenantId", "operationId") REFERENCES "StockOperation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
