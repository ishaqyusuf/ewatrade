/*
  Warnings:

  - A unique constraint covering the columns `[bookId,id,stockOperationId,stockMovementId]` on the table `FinancePurchaseReceiptLine` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,id]` on the table `StockBalanceSource` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[operationId,id,balanceSourceId]` on the table `StockMovement` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "FinanceInventoryValuationKind" AS ENUM ('PURCHASE_RECEIPT', 'OPENING', 'ISSUE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinanceInventoryUnknownReason" AS ENUM ('MISSING_OPENING_COST', 'UNCAPTURED_MOVEMENTS', 'PRIOR_UNKNOWN_COST');

-- CreateTable
CREATE TABLE "FinanceInventoryPool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "quantity" DECIMAL(38,18) NOT NULL,
    "valueMinor" BIGINT,
    "unknownReason" "FinanceInventoryUnknownReason",
    "lastStockRevision" INTEGER NOT NULL,
    "lastMovementCount" BIGINT NOT NULL,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "latestEffectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceInventoryPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInventoryValuationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "balanceSourceId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "kind" "FinanceInventoryValuationKind" NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "stockOperationId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "purchaseReceiptId" TEXT,
    "canonicalEffect" DECIMAL(38,18) NOT NULL,
    "quantityBefore" DECIMAL(38,18) NOT NULL,
    "quantityAfter" DECIMAL(38,18) NOT NULL,
    "valueBeforeMinor" BIGINT,
    "valueDeltaMinor" BIGINT,
    "valueAfterMinor" BIGINT,
    "sourceCostMinor" BIGINT,
    "unknownReason" "FinanceInventoryUnknownReason",
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceInventoryValuationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryPool_bookId_balanceSourceId_key" ON "FinanceInventoryPool"("bookId", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryPool_bookId_id_balanceSourceId_key" ON "FinanceInventoryPool"("bookId", "id", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_stockMovementId_key" ON "FinanceInventoryValuationEvent"("stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_purchaseReceiptId_key" ON "FinanceInventoryValuationEvent"("purchaseReceiptId");

-- CreateIndex
CREATE INDEX "FinanceInventoryValuationEvent_bookId_effectiveAt_id_idx" ON "FinanceInventoryValuationEvent"("bookId", "effectiveAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_poolId_sequence_key" ON "FinanceInventoryValuationEvent"("poolId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_stockOperationId_stockMoveme_key" ON "FinanceInventoryValuationEvent"("stockOperationId", "stockMovementId", "balanceSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_bookId_purchaseReceiptId_sto_key" ON "FinanceInventoryValuationEvent"("bookId", "purchaseReceiptId", "stockOperationId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInventoryValuationEvent_bookId_sourceKind_sourceId_s_key" ON "FinanceInventoryValuationEvent"("bookId", "sourceKind", "sourceId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePurchaseReceiptLine_bookId_id_stockOperationId_stock_key" ON "FinancePurchaseReceiptLine"("bookId", "id", "stockOperationId", "stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalanceSource_tenantId_id_key" ON "StockBalanceSource"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_operationId_id_balanceSourceId_key" ON "StockMovement"("operationId", "id", "balanceSourceId");

-- AddForeignKey
ALTER TABLE "FinanceInventoryPool" ADD CONSTRAINT "FinanceInventoryPool_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryPool" ADD CONSTRAINT "FinanceInventoryPool_tenantId_balanceSourceId_fkey" FOREIGN KEY ("tenantId", "balanceSourceId") REFERENCES "StockBalanceSource"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryValuationEvent" ADD CONSTRAINT "FinanceInventoryValuationEvent_tenantId_bookId_fkey" FOREIGN KEY ("tenantId", "bookId") REFERENCES "FinanceBook"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryValuationEvent" ADD CONSTRAINT "FinanceInventoryValuationEvent_bookId_poolId_balanceSource_fkey" FOREIGN KEY ("bookId", "poolId", "balanceSourceId") REFERENCES "FinanceInventoryPool"("bookId", "id", "balanceSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryValuationEvent" ADD CONSTRAINT "FinanceInventoryValuationEvent_tenantId_stockOperationId_fkey" FOREIGN KEY ("tenantId", "stockOperationId") REFERENCES "StockOperation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryValuationEvent" ADD CONSTRAINT "FinanceInventoryValuationEvent_stockOperationId_stockMovem_fkey" FOREIGN KEY ("stockOperationId", "stockMovementId", "balanceSourceId") REFERENCES "StockMovement"("operationId", "id", "balanceSourceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInventoryValuationEvent" ADD CONSTRAINT "FinanceInventoryValuationEvent_bookId_purchaseReceiptId_st_fkey" FOREIGN KEY ("bookId", "purchaseReceiptId", "stockOperationId", "stockMovementId") REFERENCES "FinancePurchaseReceiptLine"("bookId", "id", "stockOperationId", "stockMovementId") ON DELETE RESTRICT ON UPDATE CASCADE;
